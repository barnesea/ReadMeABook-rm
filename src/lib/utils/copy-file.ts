/**
 * Component: Stream-based File Copy Utility
 * Documentation: documentation/phase3/file-organization.md
 *
 * Uses read()/write() syscalls via Node.js streams instead of fs.copyFile(),
 * which relies on copy_file_range() — a syscall that fails with EPERM on
 * certain filesystem configurations (e.g. cross-export NFS4 mounts).
 */

import { createReadStream, createWriteStream } from 'fs';
import { pipeline } from 'stream/promises';

/**
 * Copy a file using streams.
 *
 * Equivalent to `fs.copyFile()` but uses standard read/write syscalls
 * instead of `copy_file_range()`, ensuring compatibility with NFS, FUSE,
 * and other network/virtual filesystems.
 */
export async function copyFile(source: string, destination: string): Promise<void> {
  await pipeline(createReadStream(source), createWriteStream(destination));
}
