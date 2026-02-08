/**
 * Component: Library Reorganization Job Processor
 * Documentation: documentation/admin-features/library-reorganization.md
 *
 * Reorganizes manually added books (books in library not created by RMAB requests)
 * to match the configured audiobook organization template.
 */

import { ReorganizeLibraryPayload } from '../services/job-queue.service';
import { prisma } from '../db';
import { getLibraryService } from '../services/library';
import { getConfigService } from '../services/config.service';
import { RMABLogger } from '../utils/logger';
import fs from 'fs/promises';
import path from 'path';

const moduleLogger = RMABLogger.create('ReorganizeLibrary');

/**
 * Process reorganize library job
 * Identifies manually added books and reorganizes them to match template
 */
export async function processReorganizeLibrary(payload: ReorganizeLibraryPayload): Promise<any> {
  const { libraryId, jobId } = payload;

  const logger = RMABLogger.forJob(jobId, 'ReorganizeLibrary');

  logger.info(`Starting library reorganization for library ${libraryId || 'default'}`);

  try {
    // 1. Get configuration
    const configService = getConfigService();
    const backendMode = await configService.getBackendMode();
    const template = await configService.get('audiobook_path_template') || '{author}/{title} {asin}';
    const mediaDir = await configService.get('media_dir') || '/media/audiobooks';
    const triggerScanAfterImport = backendMode === 'plex'
      ? (await configService.get('plex.trigger_scan_after_import')) === 'true'
      : (await configService.get('audiobookshelf.trigger_scan_after_import')) === 'true';

    logger.info(`Backend mode: ${backendMode}`);
    logger.info(`Path template: ${template}`);
    logger.info(`Media directory: ${mediaDir}`);

    // 2. Get library service
    const libraryService = await getLibraryService();

    // 3. Get library ID if not provided
    let targetLibraryId = libraryId;
    if (!targetLibraryId) {
      if (backendMode === 'audiobookshelf') {
        targetLibraryId = await configService.get('audiobookshelf.library_id') || undefined;
      } else {
        const plexConfig = await configService.getPlexConfig();
        targetLibraryId = plexConfig.libraryId || undefined;
      }
    }

    if (!targetLibraryId) {
      throw new Error('Library ID not configured');
    }

    // 4. Get all library items
    const libraryItems = await libraryService.getLibraryItems(targetLibraryId);
    logger.info(`Found ${libraryItems.length} items in library`);

    // 5. Identify manually added books (no RMAB request)
    const manuallyAddedBooks: any[] = [];

    for (const item of libraryItems) {
      if (!item.externalId || !item.title) {
        continue;
      }

      // Check if this book has a corresponding RMAB request
      const hasRequest = await prisma.audiobook.findFirst({
        where: {
          OR: [
            { plexGuid: item.externalId },
            { absItemId: item.externalId },
            { audibleAsin: item.asin || undefined },
          ],
        },
      });

      if (!hasRequest) {
        manuallyAddedBooks.push(item);
      }
    }

    logger.info(`Found ${manuallyAddedBooks.length} manually added books to reorganize`);

    // 6. Reorganize each manually added book
    let reorganizedCount = 0;
    const errors: string[] = [];

    for (const book of manuallyAddedBooks) {
      try {
        // Build target path using template
        const targetPath = buildTargetPath(
          mediaDir,
          template,
          book.author || 'Unknown Author',
          book.title,
          book.narrator,
          book.asin,
          book.year
        );

        logger.info(`Reorganizing: "${book.title}" by ${book.author}`);
        logger.info(`Current path: ${book.filePath || 'unknown'}`);
        logger.info(`Target path: ${targetPath}`);

        // Check if source file exists
        if (!book.filePath) {
          logger.warn(`No file path for "${book.title}", skipping`);
          errors.push(`No file path for "${book.title}"`);
          continue;
        }

        // Check if source exists
        try {
          await fs.access(book.filePath);
        } catch {
          logger.warn(`Source file not found: ${book.filePath}, skipping`);
          errors.push(`Source file not found: ${book.filePath}`);
          continue;
        }

        // Find audiobook files in source
        const { audioFiles, coverFile, isFile } = await findAudiobookFiles(book.filePath);

        if (audioFiles.length === 0) {
          logger.warn(`No audiobook files found in "${book.filePath}", skipping`);
          errors.push(`No audiobook files found in "${book.filePath}"`);
          continue;
        }

        logger.info(`Found ${audioFiles.length} audio files`);

        // Create target directory
        await fs.mkdir(targetPath, { recursive: true });

        // Copy audio files
        let filesCopied = 0;
        for (const audioFile of audioFiles) {
          const sourcePath = isFile ? book.filePath : path.join(book.filePath, audioFile);
          const targetFilePath = path.join(targetPath, path.basename(audioFile));

          try {
            await fs.copyFile(sourcePath, targetFilePath);
            await fs.chmod(targetFilePath, 0o644);
            filesCopied++;
            logger.info(`Copied: ${path.basename(audioFile)}`);
          } catch (error) {
            const errorMsg = error instanceof Error ? error.message : 'Unknown error';
            logger.error(`Failed to copy ${audioFile}: ${errorMsg}`);
            errors.push(`Failed to copy ${audioFile}: ${errorMsg}`);
          }
        }

        // Copy cover art if exists
        if (coverFile) {
          const sourcePath = isFile ? path.dirname(book.filePath) : path.join(book.filePath, coverFile);
          const targetCoverPath = path.join(targetPath, 'cover.jpg');

          try {
            await fs.copyFile(sourcePath, targetCoverPath);
            await fs.chmod(targetCoverPath, 0o644);
            logger.info(`Copied cover art`);
            filesCopied++;
          } catch (error) {
            logger.warn(`Failed to copy cover art: ${error instanceof Error ? error.message : 'Unknown error'}`);
            errors.push('Failed to copy cover art');
          }
        }

        if (filesCopied > 0) {
          // Update plex_library with new file path
          await prisma.plexLibrary.update({
            where: { id: book.id },
            data: {
              filePath: targetPath,
              lastScannedAt: new Date(),
              updatedAt: new Date(),
            },
          });

          reorganizedCount++;
          logger.info(`Reorganized to: ${targetPath}`);

          // Trigger library scan if enabled
          if (triggerScanAfterImport) {
            try {
              await libraryService.triggerLibraryScan(targetLibraryId);
              logger.info(`Triggered library scan for ${targetLibraryId}`);
            } catch (scanError) {
              logger.warn(`Failed to trigger library scan: ${scanError instanceof Error ? scanError.message : 'Unknown error'}`);
            }
          }
        } else {
          logger.warn(`No files copied for "${book.title}", skipping DB update`);
          errors.push(`No files copied for "${book.title}"`);
        }
      } catch (error) {
        logger.error(`Error reorganizing "${book.title}": ${error instanceof Error ? error.message : 'Unknown error'}`);
        errors.push(`Error reorganizing "${book.title}": ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }

    logger.info(`Reorganization complete: ${reorganizedCount} books reorganized, ${errors.length} errors`);

    return {
      success: true,
      message: `Reorganization complete: ${reorganizedCount} books reorganized`,
      totalBooks: manuallyAddedBooks.length,
      reorganizedCount,
      errorCount: errors.length,
      errors,
    };
  } catch (error) {
    logger.error(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    throw error;
  }
}

/**
 * Build target path using template-based path building
 */
function buildTargetPath(
  baseDir: string,
  template: string,
  author: string,
  title: string,
  narrator?: string,
  asin?: string,
  year?: number
): string {
  let result = template;

  // Substitute each variable
  const variables = { author, title, narrator, asin, year };
  for (const [key, value] of Object.entries(variables)) {
    if (value) {
      result = result.replace(new RegExp(`\\{${key}\\}`, 'g'), sanitizePath(String(value)));
    } else {
      result = result.replace(new RegExp(`\\{${key}\\}`, 'g'), '');
    }
  }

  // Clean up path
  result = result
    .replace(/[\/\\]+/g, '/')
    .split('/')
    .map(part => part.trim())
    .filter(part => part.length > 0)
    .join('/');

  return path.join(baseDir, result);
}

/**
 * Sanitize path component (remove invalid characters)
 */
function sanitizePath(name: string): string {
  return (
    name
      .replace(/[<>:"/\\|?*]/g, '')
      .trim()
      .replace(/^\.+/, '')
      .replace(/\.+$/, '')
      .replace(/\s+/g, ' ')
      .slice(0, 200)
  );
}

/**
 * Find audiobook files in a path (file or directory)
 */
async function findAudiobookFiles(pathStr: string): Promise<{ audioFiles: string[]; coverFile?: string; isFile: boolean }> {
  const audioExtensions = ['.m4b', '.m4a', '.mp3', '.mp4', '.aa', '.aax'];
  const coverPatterns = [
    /cover\.(jpg|jpeg|png)$/i,
    /folder\.(jpg|jpeg|png)$/i,
    /art\.(jpg|jpeg|png)$/i,
  ];

  const audioFiles: string[] = [];
  let coverFile: string | undefined;
  let isFile = false;

  try {
    const stats = await fs.stat(pathStr);

    if (stats.isFile()) {
      isFile = true;
      const ext = path.extname(pathStr).toLowerCase();
      if (audioExtensions.includes(ext)) {
        audioFiles.push(path.basename(pathStr));
      }
    } else {
      const files = await walkDirectory(pathStr);
      for (const file of files) {
        const ext = path.extname(file).toLowerCase();
        if (audioExtensions.includes(ext)) {
          audioFiles.push(file);
        }
        const basename = path.basename(file);
        if (coverPatterns.some((pattern) => pattern.test(basename))) {
          coverFile = file;
        }
      }
    }
  } catch (error) {
    moduleLogger.error('Error reading directory', { error: error instanceof Error ? error.message : String(error) });
    throw error;
  }

  return { audioFiles, coverFile, isFile };
}

/**
 * Recursively walk directory to find all files
 */
async function walkDirectory(dir: string, baseDir: string = ''): Promise<string[]> {
  const files: string[] = [];

  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      const relativePath = baseDir ? path.join(baseDir, entry.name) : entry.name;

      if (entry.isDirectory()) {
        const subFiles = await walkDirectory(fullPath, relativePath);
        files.push(...subFiles);
      } else {
        files.push(relativePath);
      }
    }
  } catch (error) {
    moduleLogger.error(`Error reading directory ${dir}`, { error: error instanceof Error ? error.message : String(error) });
  }

  return files;
}