/**
 * Tests for file hash generation utility
 * Documentation: documentation/fixes/file-hash-matching.md
 */

import { generateFilesHash, isValidHash } from '../../src/lib/utils/files-hash';

describe('generateFilesHash', () => {
  describe('Basic functionality', () => {
    it('should generate a 64-character SHA256 hash', () => {
      const filePaths = ['/path/to/Chapter 01.mp3', '/path/to/Chapter 02.mp3'];
      const hash = generateFilesHash(filePaths);

      expect(hash).toBeTruthy();
      expect(hash.length).toBe(64);
      expect(/^[a-f0-9]{64}$/.test(hash)).toBe(true);
    });

    it('should return empty string for empty array', () => {
      const hash = generateFilesHash([]);
      expect(hash).toBe('');
    });

    it('should return empty string for undefined input', () => {
      const hash = generateFilesHash(undefined as any);
      expect(hash).toBe('');
    });

    it('should return empty string for null input', () => {
      const hash = generateFilesHash(null as any);
      expect(hash).toBe('');
    });
  });

  describe('Audio file filtering', () => {
    it('should include all supported audio formats', () => {
      const filePaths = [
        '/path/Chapter 01.m4b',
        '/path/Chapter 02.m4a',
        '/path/Chapter 03.mp3',
        '/path/Chapter 04.mp4',
        '/path/Chapter 05.aa',
        '/path/Chapter 06.aax',
        '/path/Chapter 07.flac',
        '/path/Chapter 08.ogg',
      ];
      const hash = generateFilesHash(filePaths);
      expect(hash).toBeTruthy();
      expect(hash.length).toBe(64);
    });

    it('should include FLAC files in hash generation', () => {
      const withFlac = ['/path/Chapter 01.flac', '/path/Chapter 02.flac'];
      const hash = generateFilesHash(withFlac);
      expect(hash).toBeTruthy();
      expect(hash.length).toBe(64);
    });

    it('should include OGG files in hash generation', () => {
      const withOgg = ['/path/Chapter 01.ogg', '/path/Chapter 02.ogg'];
      const hash = generateFilesHash(withOgg);
      expect(hash).toBeTruthy();
      expect(hash.length).toBe(64);
    });

    it('should filter out non-audio files', () => {
      const filePaths = [
        '/path/Chapter 01.mp3',
        '/path/Chapter 02.mp3',
        '/path/cover.jpg',
        '/path/metadata.nfo',
        '/path/info.txt',
      ];
      const hash = generateFilesHash(filePaths);

      // Should only hash the 2 MP3 files
      const audioOnlyHash = generateFilesHash(['/path/Chapter 01.mp3', '/path/Chapter 02.mp3']);
      expect(hash).toBe(audioOnlyHash);
    });

    it('should return empty string when no audio files present', () => {
      const filePaths = ['/path/cover.jpg', '/path/metadata.nfo', '/path/info.txt'];
      const hash = generateFilesHash(filePaths);
      expect(hash).toBe('');
    });

    it('should handle mixed case audio extensions', () => {
      const filePaths = ['/path/Chapter.MP3', '/path/Chapter.M4B', '/path/Chapter.m4a'];
      const hash = generateFilesHash(filePaths);
      expect(hash).toBeTruthy();
      expect(hash.length).toBe(64);
    });
  });

  describe('Deterministic behavior', () => {
    it('should generate the same hash for the same files', () => {
      const filePaths = ['/path/Chapter 01.mp3', '/path/Chapter 02.mp3', '/path/Chapter 03.mp3'];
      const hash1 = generateFilesHash(filePaths);
      const hash2 = generateFilesHash(filePaths);

      expect(hash1).toBe(hash2);
    });

    it('should generate the same hash regardless of input order', () => {
      const files1 = ['/path/Chapter 03.mp3', '/path/Chapter 01.mp3', '/path/Chapter 02.mp3'];
      const files2 = ['/path/Chapter 01.mp3', '/path/Chapter 02.mp3', '/path/Chapter 03.mp3'];

      const hash1 = generateFilesHash(files1);
      const hash2 = generateFilesHash(files2);

      expect(hash1).toBe(hash2);
    });

    it('should be case-insensitive for filenames', () => {
      const files1 = ['/path/CHAPTER 01.mp3', '/path/CHAPTER 02.mp3'];
      const files2 = ['/path/chapter 01.mp3', '/path/chapter 02.mp3'];

      const hash1 = generateFilesHash(files1);
      const hash2 = generateFilesHash(files2);

      expect(hash1).toBe(hash2);
    });

    it('should be path-agnostic (only basename matters)', () => {
      const files1 = ['/path/to/audiobooks/Chapter 01.mp3', '/path/to/audiobooks/Chapter 02.mp3'];
      const files2 = ['/different/path/Chapter 01.mp3', '/different/path/Chapter 02.mp3'];

      const hash1 = generateFilesHash(files1);
      const hash2 = generateFilesHash(files2);

      expect(hash1).toBe(hash2);
    });
  });

  describe('Differentiating behavior', () => {
    it('should generate different hashes for different files', () => {
      const files1 = ['/path/Chapter 01.mp3', '/path/Chapter 02.mp3'];
      const files2 = ['/path/Chapter 01.mp3', '/path/Chapter 03.mp3'];

      const hash1 = generateFilesHash(files1);
      const hash2 = generateFilesHash(files2);

      expect(hash1).not.toBe(hash2);
    });

    it('should generate different hashes for different file counts', () => {
      const files1 = ['/path/Chapter 01.mp3', '/path/Chapter 02.mp3'];
      const files2 = ['/path/Chapter 01.mp3', '/path/Chapter 02.mp3', '/path/Chapter 03.mp3'];

      const hash1 = generateFilesHash(files1);
      const hash2 = generateFilesHash(files2);

      expect(hash1).not.toBe(hash2);
    });

    it('should generate different hashes for different extensions', () => {
      const files1 = ['/path/Chapter 01.mp3'];
      const files2 = ['/path/Chapter 01.m4b'];

      const hash1 = generateFilesHash(files1);
      const hash2 = generateFilesHash(files2);

      expect(hash1).not.toBe(hash2);
    });
  });

  describe('Edge cases', () => {
    it('should handle single file', () => {
      const hash = generateFilesHash(['/path/audiobook.m4b']);
      expect(hash).toBeTruthy();
      expect(hash.length).toBe(64);
    });

    it('should handle files with special characters', () => {
      const filePaths = [
        "/path/Chapter 01 - The Hero's Journey.mp3",
        '/path/Chapter 02 (Part A).mp3',
        '/path/Chapter 03 [Bonus].mp3',
      ];
      const hash = generateFilesHash(filePaths);
      expect(hash).toBeTruthy();
      expect(hash.length).toBe(64);
    });

    it('should handle files with Unicode characters', () => {
      const filePaths = ['/path/Chapitre 01 - Café.mp3', '/path/Kapitel 02 - Müller.mp3'];
      const hash = generateFilesHash(filePaths);
      expect(hash).toBeTruthy();
      expect(hash.length).toBe(64);
    });

    it('should handle duplicate filenames (same file listed twice)', () => {
      // This shouldn't happen in practice, but we should handle it gracefully
      const filePaths = ['/path/Chapter 01.mp3', '/path/Chapter 01.mp3'];
      const hash = generateFilesHash(filePaths);
      expect(hash).toBeTruthy();
      expect(hash.length).toBe(64);
    });

    it('should handle very long file paths', () => {
      const longPath = '/very/long/path/'.repeat(20) + 'Chapter 01.mp3';
      const hash = generateFilesHash([longPath]);
      expect(hash).toBeTruthy();
      expect(hash.length).toBe(64);
    });

    it('should handle large number of files', () => {
      const filePaths = Array.from({ length: 100 }, (_, i) => `/path/Chapter ${String(i + 1).padStart(3, '0')}.mp3`);
      const hash = generateFilesHash(filePaths);
      expect(hash).toBeTruthy();
      expect(hash.length).toBe(64);
    });
  });

  describe('Real-world scenarios', () => {
    it('should match chapter-merged audiobook', () => {
      // Before merging: 20 MP3 files
      const beforeMerge = Array.from({ length: 20 }, (_, i) => `/path/Chapter ${String(i + 1).padStart(2, '0')}.mp3`);

      // After merging: Single M4B file
      const afterMerge = ['/path/Audiobook.m4b'];

      const hash1 = generateFilesHash(beforeMerge);
      const hash2 = generateFilesHash(afterMerge);

      // These SHOULD be different (different files)
      expect(hash1).not.toBe(hash2);
    });

    it('should match Windows and Unix path separators', () => {
      const windowsPath = ['C:\\Users\\Books\\Chapter 01.mp3', 'C:\\Users\\Books\\Chapter 02.mp3'];
      const unixPath = ['/home/books/Chapter 01.mp3', '/home/books/Chapter 02.mp3'];

      const hash1 = generateFilesHash(windowsPath);
      const hash2 = generateFilesHash(unixPath);

      // Should be the same (basename is identical)
      expect(hash1).toBe(hash2);
    });
  });
});

describe('isValidHash', () => {
  it('should validate correct SHA256 hashes', () => {
    const validHash = 'a'.repeat(64);
    expect(isValidHash(validHash)).toBe(true);
  });

  it('should validate lowercase hex hashes', () => {
    const validHash = 'abcdef0123456789'.repeat(4);
    expect(isValidHash(validHash)).toBe(true);
  });

  it('should validate uppercase hex hashes', () => {
    const validHash = 'ABCDEF0123456789'.repeat(4);
    expect(isValidHash(validHash)).toBe(true);
  });

  it('should reject hashes with wrong length', () => {
    expect(isValidHash('abc123')).toBe(false);
    expect(isValidHash('a'.repeat(63))).toBe(false);
    expect(isValidHash('a'.repeat(65))).toBe(false);
  });

  it('should reject hashes with invalid characters', () => {
    const invalidHash = 'g'.repeat(64);
    expect(isValidHash(invalidHash)).toBe(false);
  });

  it('should reject empty string', () => {
    expect(isValidHash('')).toBe(false);
  });

  it('should reject non-string input', () => {
    expect(isValidHash(null as any)).toBe(false);
    expect(isValidHash(undefined as any)).toBe(false);
    expect(isValidHash(123 as any)).toBe(false);
  });
});
