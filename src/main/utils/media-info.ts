import fs from 'fs';
import crypto from 'crypto';
import { sanitizePath } from '../../shared/utils';

const CHUNK_SIZE = 128 * 1024; // 128 KB

function readChunk(fd: number, position: number, length: number): Buffer {
  const safeLength = Math.max(0, Math.min(length, CHUNK_SIZE));
  if (safeLength === 0) {
    return Buffer.alloc(0);
  }

  const buffer = Buffer.allocUnsafe(safeLength);
  const bytesRead = fs.readSync(fd, buffer, 0, safeLength, position);
  return bytesRead === safeLength ? buffer : buffer.subarray(0, bytesRead);
}

export function generateFileFingerprint(filePath: string, fileSize: number): string {
  const hash = crypto.createHash('sha256');
  hash.update(String(fileSize));

  let fd: number | null = null;
  try {
    fd = fs.openSync(filePath, 'r');

    const firstChunkSize = Math.min(fileSize, CHUNK_SIZE);
    hash.update(readChunk(fd, 0, firstChunkSize));

    if (fileSize > CHUNK_SIZE * 2) {
      const middleOffset = Math.max(0, Math.floor(fileSize / 2) - Math.floor(CHUNK_SIZE / 2));
      hash.update(readChunk(fd, middleOffset, CHUNK_SIZE));
    }

    if (fileSize > CHUNK_SIZE) {
      const lastOffset = Math.max(0, fileSize - CHUNK_SIZE);
      hash.update(readChunk(fd, lastOffset, CHUNK_SIZE));
    }
  } catch (error) {
    console.warn('Failed to generate file fingerprint', {
      file: sanitizePath(filePath),
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  } finally {
    if (fd !== null) {
      fs.closeSync(fd);
    }
  }

  return hash.digest('hex');
}
