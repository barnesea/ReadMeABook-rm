/**
 * Component: Metadata Tagging Utility Tests
 * Documentation: documentation/phase3/file-organization.md
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { checkFfmpegAvailable, tagAudioFileMetadata, tagMultipleFiles } from '@/lib/utils/metadata-tagger';

const execMock = vi.hoisted(() => vi.fn());
const fsMock = vi.hoisted(() => ({
  access: vi.fn(),
  unlink: vi.fn(),
}));

vi.mock('child_process', () => ({
  exec: execMock,
}));

vi.mock('fs/promises', () => ({
  default: fsMock,
  ...fsMock,
}));

function mockExecSuccess(stdout = 'ok') {
  execMock.mockImplementation((command: string, options: any, callback?: any) => {
    const cb = typeof options === 'function' ? options : callback;
    cb(null, stdout, '');
  });
}

function mockExecFailure(message = 'ffmpeg error') {
  execMock.mockImplementation((command: string, options: any, callback?: any) => {
    const cb = typeof options === 'function' ? options : callback;
    cb(new Error(message), '', '');
  });
}

describe('metadata tagger', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns an error for unsupported file formats', async () => {
    fsMock.access.mockResolvedValue(undefined);

    const result = await tagAudioFileMetadata('/tmp/book.wav', {
      title: 'Book',
      author: 'Author',
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('Unsupported file format');
    expect(execMock).not.toHaveBeenCalled();
  });

  it('tags an m4b file with metadata', async () => {
    fsMock.access.mockResolvedValue(undefined);
    mockExecSuccess('done');

    const result = await tagAudioFileMetadata('/tmp/book.m4b', {
      title: 'Book',
      author: 'Author',
      narrator: 'Narrator',
      year: 2020,
      asin: 'ASIN123',
    });

    expect(result.success).toBe(true);
    expect(result.taggedFilePath).toBe('/tmp/book.m4b.tmp');

    const command = execMock.mock.calls[0][0] as string;
    expect(command).toContain('-metadata title="Book"');
    expect(command).toContain('-metadata album_artist="Author"');
    expect(command).toContain('-metadata composer="Narrator"');
    expect(command).toContain('-metadata date="2020"');
    expect(command).toContain('-metadata ----:com.apple.iTunes:ASIN="ASIN123"');
    expect(command).toContain('-f mp4');
  });

  it('cleans up temp files and returns errors when ffmpeg fails', async () => {
    fsMock.access.mockResolvedValue(undefined);
    fsMock.unlink.mockResolvedValue(undefined);
    mockExecFailure('exec failed');

    const result = await tagAudioFileMetadata('/tmp/book.mp3', {
      title: 'Book',
      author: 'Author',
      asin: 'ASIN123',
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('ffmpeg failed');
    expect(fsMock.unlink).toHaveBeenCalledWith('/tmp/book.mp3.tmp');
  });

  it('tags multiple files in sequence', async () => {
    fsMock.access.mockResolvedValue(undefined);
    mockExecSuccess('done');

    const results = await tagMultipleFiles(['/tmp/one.m4a', '/tmp/two.m4a'], {
      title: 'Book',
      author: 'Author',
    });

    expect(results).toHaveLength(2);
    expect(results.every((result) => result.success)).toBe(true);
  });

  it('checks ffmpeg availability', async () => {
    mockExecSuccess('ffmpeg version');
    await expect(checkFfmpegAvailable()).resolves.toBe(true);

    mockExecFailure('not installed');
    await expect(checkFfmpegAvailable()).resolves.toBe(false);
  });

  describe('metadata escaping', () => {
    it('does NOT escape single quotes (they are literal in double-quoted shell strings)', async () => {
      fsMock.access.mockResolvedValue(undefined);
      mockExecSuccess('done');

      await tagAudioFileMetadata('/tmp/book.m4b', {
        title: "It's Not Her",
        author: "Author's Name",
      });

      const command = execMock.mock.calls[0][0] as string;
      // Single quotes should appear as-is, NOT escaped with backslash
      expect(command).toContain('-metadata title="It\'s Not Her"');
      expect(command).not.toContain("It\\'s"); // No backslash-escaped single quotes
      expect(command).toContain('-metadata album_artist="Author\'s Name"');
    });

    it('escapes double quotes in metadata values', async () => {
      fsMock.access.mockResolvedValue(undefined);
      mockExecSuccess('done');

      await tagAudioFileMetadata('/tmp/book.m4b', {
        title: 'Book "Title"',
        author: 'Author',
      });

      const command = execMock.mock.calls[0][0] as string;
      expect(command).toContain('-metadata title="Book \\"Title\\""');
    });

    it('escapes backticks to prevent command substitution', async () => {
      fsMock.access.mockResolvedValue(undefined);
      mockExecSuccess('done');

      await tagAudioFileMetadata('/tmp/book.m4b', {
        title: 'Book `test`',
        author: 'Author',
      });

      const command = execMock.mock.calls[0][0] as string;
      expect(command).toContain('-metadata title="Book \\`test\\`"');
    });

    it('escapes dollar signs to prevent variable expansion', async () => {
      fsMock.access.mockResolvedValue(undefined);
      mockExecSuccess('done');

      await tagAudioFileMetadata('/tmp/book.m4b', {
        title: 'Book $100',
        author: 'Author',
      });

      const command = execMock.mock.calls[0][0] as string;
      expect(command).toContain('-metadata title="Book \\$100"');
    });

    it('escapes backslashes before other characters', async () => {
      fsMock.access.mockResolvedValue(undefined);
      mockExecSuccess('done');

      await tagAudioFileMetadata('/tmp/book.m4b', {
        title: 'Path\\to\\book',
        author: 'Author',
      });

      const command = execMock.mock.calls[0][0] as string;
      expect(command).toContain('-metadata title="Path\\\\to\\\\book"');
    });

    it('handles complex titles with multiple special characters', async () => {
      fsMock.access.mockResolvedValue(undefined);
      mockExecSuccess('done');

      await tagAudioFileMetadata('/tmp/book.m4b', {
        title: "Don't Say \"Hello\" for $5",
        author: "O'Brien",
      });

      const command = execMock.mock.calls[0][0] as string;
      // Single quotes literal, double quotes escaped, dollar escaped
      expect(command).toContain('-metadata title="Don\'t Say \\"Hello\\" for \\$5"');
      expect(command).toContain('-metadata album_artist="O\'Brien"');
    });
  });
});
