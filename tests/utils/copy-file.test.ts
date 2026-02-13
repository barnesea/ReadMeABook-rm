/**
 * Component: Stream-based File Copy Utility Tests
 * Documentation: documentation/phase3/file-organization.md
 */

import { describe, expect, it, vi, beforeEach } from 'vitest';
import { Readable, Writable } from 'stream';

const pipelineMock = vi.hoisted(() => vi.fn());
const createReadStreamMock = vi.hoisted(() => vi.fn());
const createWriteStreamMock = vi.hoisted(() => vi.fn());

vi.mock('stream/promises', () => ({
  pipeline: pipelineMock,
}));

vi.mock('fs', () => ({
  createReadStream: createReadStreamMock,
  createWriteStream: createWriteStreamMock,
}));

import { copyFile } from '@/lib/utils/copy-file';

describe('copyFile', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('pipes source to destination via pipeline', async () => {
    const mockReadStream = new Readable({ read() {} });
    const mockWriteStream = new Writable({ write(_, __, cb) { cb(); } });

    createReadStreamMock.mockReturnValue(mockReadStream);
    createWriteStreamMock.mockReturnValue(mockWriteStream);
    pipelineMock.mockResolvedValue(undefined);

    await copyFile('/source/file.m4b', '/dest/file.m4b');

    expect(createReadStreamMock).toHaveBeenCalledWith('/source/file.m4b');
    expect(createWriteStreamMock).toHaveBeenCalledWith('/dest/file.m4b');
    expect(pipelineMock).toHaveBeenCalledWith(mockReadStream, mockWriteStream);
  });

  it('propagates read errors', async () => {
    const mockReadStream = new Readable({ read() {} });
    const mockWriteStream = new Writable({ write(_, __, cb) { cb(); } });

    createReadStreamMock.mockReturnValue(mockReadStream);
    createWriteStreamMock.mockReturnValue(mockWriteStream);
    pipelineMock.mockRejectedValue(
      Object.assign(new Error('ENOENT: no such file or directory'), { code: 'ENOENT' })
    );

    await expect(copyFile('/missing/file.m4b', '/dest/file.m4b'))
      .rejects.toThrow('ENOENT');
  });

  it('propagates write errors', async () => {
    const mockReadStream = new Readable({ read() {} });
    const mockWriteStream = new Writable({ write(_, __, cb) { cb(); } });

    createReadStreamMock.mockReturnValue(mockReadStream);
    createWriteStreamMock.mockReturnValue(mockWriteStream);
    pipelineMock.mockRejectedValue(
      Object.assign(new Error('EACCES: permission denied'), { code: 'EACCES' })
    );

    await expect(copyFile('/source/file.m4b', '/readonly/file.m4b'))
      .rejects.toThrow('EACCES');
  });

  it('propagates EPERM errors (the original bug scenario)', async () => {
    const mockReadStream = new Readable({ read() {} });
    const mockWriteStream = new Writable({ write(_, __, cb) { cb(); } });

    createReadStreamMock.mockReturnValue(mockReadStream);
    createWriteStreamMock.mockReturnValue(mockWriteStream);
    pipelineMock.mockRejectedValue(
      Object.assign(new Error('EPERM: operation not permitted'), { code: 'EPERM' })
    );

    await expect(copyFile('/nfs/source.m4b', '/nfs/dest.m4b'))
      .rejects.toThrow('EPERM');
  });
});
