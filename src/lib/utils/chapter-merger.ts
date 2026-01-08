/**
 * Component: Chapter Merger Utility
 * Documentation: documentation/features/chapter-merging.md
 *
 * Merges multi-file audiobook chapter downloads into a single M4B file
 * with proper chapter markers.
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs/promises';
import { JobLogger } from './job-logger';

const execPromise = promisify(exec);

// Supported audio formats for chapter merging
const SUPPORTED_FORMATS = ['.mp3', '.m4a', '.m4b', '.mp4', '.aac'];

// Patterns that indicate chapter-based files
const CHAPTER_PATTERNS = [
  /^(\d{1,3})[\s._-]/,        // "01 - Title.mp3", "1.mp3", "001_chapter.mp3"
  /chapter\s*(\d+)/i,         // "Chapter 1.mp3", "chapter01.mp3"
  /ch\s*(\d+)/i,              // "Ch1.mp3", "ch 01.mp3"
  /part\s*(\d+)/i,            // "Part 1.mp3"
  /disc\s*(\d+)/i,            // "Disc 1.mp3"
  /track\s*(\d+)/i,           // "Track 1.mp3"
];

// Generic title patterns to ignore when extracting chapter names
const GENERIC_TITLE_PATTERNS = [
  /^track\s*\d+$/i,
  /^chapter\s*\d+$/i,
  /^\d+$/,
  /^part\s*\d+$/i,
];

export interface ChapterFile {
  path: string;
  filename: string;
  duration: number;           // milliseconds
  bitrate?: number;           // kbps
  trackNumber?: number;       // from metadata
  titleMetadata?: string;     // from metadata
  chapterTitle: string;       // final computed title
}

export interface AudioProbeResult {
  duration: number;           // milliseconds
  bitrate?: number;           // kbps
  trackNumber?: number;
  title?: string;
  format: string;
}

export interface MergeOptions {
  title: string;
  author: string;
  narrator?: string;
  year?: number;
  asin?: string;
  outputPath: string;
}

export interface MergeResult {
  success: boolean;
  outputPath?: string;
  chapterCount?: number;
  totalDuration?: number;     // milliseconds
  error?: string;
}

/**
 * Detect if the given files appear to be chapter files that should be merged
 */
export async function detectChapterFiles(files: string[]): Promise<boolean> {
  // Need at least 2 files to merge
  if (files.length < 2) {
    return false;
  }

  // All files must have same audio format
  const extensions = new Set(files.map(f => path.extname(f).toLowerCase()));
  if (extensions.size > 1) {
    return false;
  }

  // Must be a supported format
  const ext = [...extensions][0];
  if (!SUPPORTED_FORMATS.includes(ext)) {
    return false;
  }

  // Check if files match chapter patterns
  const filenames = files.map(f => path.basename(f));
  const matchingFiles = filenames.filter(filename =>
    CHAPTER_PATTERNS.some(pattern => pattern.test(filename))
  );

  // At least 80% of files should match chapter patterns
  const matchRatio = matchingFiles.length / filenames.length;
  return matchRatio >= 0.8;
}

/**
 * Probe an audio file to extract duration and metadata
 */
export async function probeAudioFile(filePath: string): Promise<AudioProbeResult> {
  const command = `ffprobe -v quiet -print_format json -show_format -show_streams "${filePath}"`;

  try {
    const { stdout } = await execPromise(command, { timeout: 30000 });
    const data = JSON.parse(stdout);

    const format = data.format || {};
    const tags = format.tags || {};

    // Duration in milliseconds
    const duration = Math.round((parseFloat(format.duration) || 0) * 1000);

    // Bitrate in kbps
    const bitrate = format.bit_rate ? Math.round(parseInt(format.bit_rate) / 1000) : undefined;

    // Track number (various possible tag names)
    let trackNumber: number | undefined;
    const trackStr = tags.track || tags.TRACK || tags['track-number'];
    if (trackStr) {
      // Handle "1/10" format
      const match = String(trackStr).match(/^(\d+)/);
      if (match) {
        trackNumber = parseInt(match[1]);
      }
    }

    // Title
    const title = tags.title || tags.TITLE || undefined;

    // File extension as format indicator
    const fileFormat = path.extname(filePath).toLowerCase().slice(1);

    return {
      duration,
      bitrate,
      trackNumber,
      title,
      format: fileFormat,
    };
  } catch (error) {
    throw new Error(`Failed to probe audio file: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Natural sort comparison for filenames
 * Handles numeric sequences correctly: ch1, ch2, ch10 (not ch1, ch10, ch2)
 */
function naturalSortCompare(a: string, b: string): number {
  const aParts = a.split(/(\d+)/);
  const bParts = b.split(/(\d+)/);

  for (let i = 0; i < Math.max(aParts.length, bParts.length); i++) {
    const aPart = aParts[i] || '';
    const bPart = bParts[i] || '';

    // Check if both parts are numeric
    const aNum = parseInt(aPart);
    const bNum = parseInt(bPart);

    if (!isNaN(aNum) && !isNaN(bNum)) {
      if (aNum !== bNum) return aNum - bNum;
    } else {
      const cmp = aPart.localeCompare(bPart, undefined, { sensitivity: 'base' });
      if (cmp !== 0) return cmp;
    }
  }

  return 0;
}

/**
 * Check if a title is generic (should be ignored)
 */
function isGenericTitle(title: string): boolean {
  return GENERIC_TITLE_PATTERNS.some(pattern => pattern.test(title.trim()));
}

/**
 * Extract chapter name from filename
 */
function extractChapterNameFromFilename(filename: string): string | null {
  const basename = path.basename(filename, path.extname(filename));

  // Try to extract meaningful name after chapter indicator
  // "01 - The Beginning" -> "The Beginning"
  // "Chapter 1 - Introduction" -> "Introduction"
  const patterns = [
    /^\d+[\s._-]+(.+)$/,                    // "01 - Title" or "01_Title"
    /^chapter\s*\d+[\s._-]+(.+)$/i,         // "Chapter 1 - Title"
    /^ch\s*\d+[\s._-]+(.+)$/i,              // "Ch1 - Title"
    /^part\s*\d+[\s._-]+(.+)$/i,            // "Part 1 - Title"
  ];

  for (const pattern of patterns) {
    const match = basename.match(pattern);
    if (match && match[1]) {
      const extracted = match[1].trim();
      if (extracted.length > 0 && !isGenericTitle(extracted)) {
        return extracted;
      }
    }
  }

  return null;
}

/**
 * Get chapter title with priority: metadata > filename > fallback
 */
function getChapterTitle(file: ChapterFile, index: number): string {
  // Priority 1: Title metadata (if meaningful)
  if (file.titleMetadata && !isGenericTitle(file.titleMetadata)) {
    return file.titleMetadata;
  }

  // Priority 2: Extract from filename
  const extracted = extractChapterNameFromFilename(file.filename);
  if (extracted) {
    return extracted;
  }

  // Priority 3: Fallback to "Chapter X"
  return `Chapter ${index + 1}`;
}

/**
 * Analyze and order chapter files
 * Returns files in correct order with metadata populated
 */
export async function analyzeChapterFiles(
  filePaths: string[],
  logger?: JobLogger
): Promise<ChapterFile[]> {
  // Probe all files in parallel
  const probePromises = filePaths.map(async (filePath) => {
    const probe = await probeAudioFile(filePath);
    return {
      path: filePath,
      filename: path.basename(filePath),
      duration: probe.duration,
      bitrate: probe.bitrate,
      trackNumber: probe.trackNumber,
      titleMetadata: probe.title,
      chapterTitle: '', // Will be computed after ordering
    };
  });

  const files = await Promise.all(probePromises);

  // Create filename-based order (natural sort)
  const filenameOrder = [...files].sort((a, b) =>
    naturalSortCompare(a.filename, b.filename)
  );

  // Check if metadata order is available and valid
  const hasAllTrackNumbers = files.every(f => f.trackNumber !== undefined && f.trackNumber > 0);
  let useMetadataOrder = false;
  let metadataOrder: ChapterFile[] = [];

  if (hasAllTrackNumbers) {
    metadataOrder = [...files].sort((a, b) => (a.trackNumber || 0) - (b.trackNumber || 0));

    // Check if track numbers are sequential
    const isSequential = metadataOrder.every((f, i) => {
      const expectedTrack = i + 1;
      return f.trackNumber === expectedTrack;
    });

    if (isSequential) {
      // Compare orders
      const ordersMatch = filenameOrder.every((f, i) => f.path === metadataOrder[i].path);

      if (ordersMatch) {
        await logger?.info('Chapter ordering: filename and metadata orders match - high confidence');
      } else {
        await logger?.warn('Chapter ordering: filename order differs from metadata - using metadata order (more reliable)');
        useMetadataOrder = true;
      }
    } else {
      await logger?.warn('Chapter ordering: metadata track numbers not sequential - using filename order');
    }
  } else {
    await logger?.info('Chapter ordering: incomplete metadata track numbers - using filename order');
  }

  // Use the determined order
  const orderedFiles = useMetadataOrder ? metadataOrder : filenameOrder;

  // Compute chapter titles
  for (let i = 0; i < orderedFiles.length; i++) {
    orderedFiles[i].chapterTitle = getChapterTitle(orderedFiles[i], i);
  }

  return orderedFiles;
}

/**
 * Generate FFMETADATA1 format chapter metadata
 */
function generateChapterMetadata(chapters: ChapterFile[]): string {
  let metadata = ';FFMETADATA1\n';

  let currentTime = 0; // milliseconds

  for (const chapter of chapters) {
    const startTime = currentTime;
    const endTime = currentTime + chapter.duration;

    // Escape special characters in title
    const escapedTitle = chapter.chapterTitle
      .replace(/\\/g, '\\\\')
      .replace(/=/g, '\\=')
      .replace(/;/g, '\\;')
      .replace(/#/g, '\\#')
      .replace(/\n/g, '');

    metadata += '\n[CHAPTER]\n';
    metadata += 'TIMEBASE=1/1000\n';
    metadata += `START=${startTime}\n`;
    metadata += `END=${endTime}\n`;
    metadata += `title=${escapedTitle}\n`;

    currentTime = endTime;
  }

  return metadata;
}

/**
 * Determine optimal bitrate for MP3 conversion
 * Uses source bitrate if < 128kbps, otherwise 128k
 */
function determineOutputBitrate(chapters: ChapterFile[]): string {
  // Find minimum bitrate across all files
  const bitrates = chapters
    .filter(c => c.bitrate !== undefined)
    .map(c => c.bitrate as number);

  if (bitrates.length === 0) {
    return '128k';
  }

  const minBitrate = Math.min(...bitrates);

  // Use source bitrate if lower than 128k, otherwise cap at 128k
  if (minBitrate < 128) {
    return `${minBitrate}k`;
  }

  return '128k';
}

/**
 * Merge chapter files into a single M4B with chapter markers
 */
export async function mergeChapters(
  chapters: ChapterFile[],
  options: MergeOptions,
  logger?: JobLogger
): Promise<MergeResult> {
  if (chapters.length === 0) {
    return { success: false, error: 'No chapters to merge' };
  }

  const tempDir = path.dirname(options.outputPath);
  const concatFile = path.join(tempDir, `concat_${Date.now()}.txt`);
  const metadataFile = path.join(tempDir, `chapters_${Date.now()}.txt`);

  try {
    // Ensure temp directory exists
    await fs.mkdir(tempDir, { recursive: true });

    // Create concat file
    const concatContent = chapters
      .map(c => `file '${c.path.replace(/'/g, "'\\''")}'`)
      .join('\n');
    await fs.writeFile(concatFile, concatContent);

    // Create chapter metadata file
    const chapterMetadata = generateChapterMetadata(chapters);
    await fs.writeFile(metadataFile, chapterMetadata);

    // Determine if we need to re-encode (MP3 input requires conversion to AAC)
    const inputFormat = path.extname(chapters[0].path).toLowerCase();
    const needsReencode = inputFormat === '.mp3';

    // Build ffmpeg command
    const args: string[] = [
      'ffmpeg',
      '-y',
      '-f', 'concat',
      '-safe', '0',
      '-i', `"${concatFile}"`,
      '-i', `"${metadataFile}"`,
      '-map_metadata', '1',
    ];

    if (needsReencode) {
      // MP3 -> M4B requires re-encoding to AAC
      const bitrate = determineOutputBitrate(chapters);
      args.push('-codec:a', 'aac', '-b:a', bitrate);
      await logger?.info(`Re-encoding MP3 to AAC at ${bitrate}`);
    } else {
      // M4A/M4B -> M4B can use codec copy (fast, lossless)
      args.push('-codec', 'copy');
      await logger?.info('Using codec copy (no re-encoding)');
    }

    // Add book metadata
    const escapeMetadata = (val: string): string =>
      val.replace(/"/g, '\\"').replace(/'/g, "\\'");

    args.push('-metadata', `title="${escapeMetadata(options.title)}"`);
    args.push('-metadata', `album="${escapeMetadata(options.title)}"`);
    args.push('-metadata', `album_artist="${escapeMetadata(options.author)}"`);
    args.push('-metadata', `artist="${escapeMetadata(options.author)}"`);

    if (options.narrator) {
      args.push('-metadata', `composer="${escapeMetadata(options.narrator)}"`);
    }

    if (options.year) {
      args.push('-metadata', `date="${options.year}"`);
    }

    if (options.asin) {
      // Custom iTunes tag for ASIN
      args.push('-metadata', `----:com.apple.iTunes:ASIN="${escapeMetadata(options.asin)}"`);
    }

    // Output format
    args.push('-f', 'mp4');
    args.push(`"${options.outputPath}"`);

    const command = args.join(' ');

    // Calculate timeout: base 5 minutes + 30 seconds per chapter
    const timeout = (5 * 60 * 1000) + (chapters.length * 30 * 1000);

    await logger?.info(`Merging ${chapters.length} chapters...`);

    try {
      await execPromise(command, { timeout });
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`FFmpeg merge failed: ${errorMsg}`);
    }

    // Verify output file exists
    try {
      await fs.access(options.outputPath);
    } catch {
      throw new Error('Merged file not created');
    }

    // Calculate total duration
    const totalDuration = chapters.reduce((sum, c) => sum + c.duration, 0);

    await logger?.info(`Merge complete: ${chapters.length} chapters, ${formatDuration(totalDuration)}`);

    return {
      success: true,
      outputPath: options.outputPath,
      chapterCount: chapters.length,
      totalDuration,
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    return { success: false, error: errorMsg };
  } finally {
    // Clean up temp files
    try {
      await fs.unlink(concatFile);
    } catch {
      // Ignore cleanup errors
    }
    try {
      await fs.unlink(metadataFile);
    } catch {
      // Ignore cleanup errors
    }
  }
}

/**
 * Format duration in milliseconds to human readable string
 */
export function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  if (hours > 0) {
    return `${hours}h ${minutes}m ${secs}s`;
  } else if (minutes > 0) {
    return `${minutes}m ${secs}s`;
  }
  return `${secs}s`;
}

/**
 * Check available disk space in directory
 * Returns available bytes, or null if unable to determine
 */
export async function checkDiskSpace(directory: string): Promise<number | null> {
  try {
    // Use df on Unix-like systems
    const { stdout } = await execPromise(`df -k "${directory}" | tail -1 | awk '{print $4}'`);
    const availableKb = parseInt(stdout.trim());
    if (!isNaN(availableKb)) {
      return availableKb * 1024; // Convert to bytes
    }
  } catch {
    // df not available (Windows) or other error
  }

  return null;
}

/**
 * Estimate output file size (sum of inputs + 10% overhead)
 */
export async function estimateOutputSize(filePaths: string[]): Promise<number> {
  let totalSize = 0;

  for (const filePath of filePaths) {
    try {
      const stats = await fs.stat(filePath);
      totalSize += stats.size;
    } catch {
      // Ignore errors, estimate conservatively
    }
  }

  // Add 10% overhead for metadata and format differences
  return Math.ceil(totalSize * 1.1);
}
