import fs from 'fs';
import crypto from 'crypto';
import { sanitizePath } from '../../shared/utils';

const CHUNK_SIZE = 128 * 1024; // 128 KB

async function readChunk(
  handle: fs.promises.FileHandle,
  position: number,
  length: number
): Promise<Buffer> {
  const safeLength = Math.max(0, Math.min(length, CHUNK_SIZE));
  if (safeLength === 0) {
    return Buffer.alloc(0);
  }

  const buffer = Buffer.allocUnsafe(safeLength);
  const { bytesRead } = await handle.read(buffer, 0, safeLength, position);
  return bytesRead === safeLength ? buffer : buffer.subarray(0, bytesRead);
}

export async function generateFileFingerprint(filePath: string, fileSize: number): Promise<string> {
  const hash = crypto.createHash('sha256');
  hash.update(String(fileSize));

  let fileHandle: fs.promises.FileHandle | null = null;
  try {
    fileHandle = await fs.promises.open(filePath, 'r');

    const firstChunkSize = Math.min(fileSize, CHUNK_SIZE);
    hash.update(await readChunk(fileHandle, 0, firstChunkSize));

    if (fileSize > CHUNK_SIZE * 2) {
      const middleOffset = Math.max(0, Math.floor(fileSize / 2) - Math.floor(CHUNK_SIZE / 2));
      hash.update(await readChunk(fileHandle, middleOffset, CHUNK_SIZE));
    }

    if (fileSize > CHUNK_SIZE) {
      const lastOffset = Math.max(0, fileSize - CHUNK_SIZE);
      hash.update(await readChunk(fileHandle, lastOffset, CHUNK_SIZE));
    }
  } catch (error) {
    console.warn('Failed to generate file fingerprint', {
      file: sanitizePath(filePath),
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  } finally {
    if (fileHandle !== null) {
      try {
        await fileHandle.close();
      } catch (closeError) {
        console.warn('Failed to close file after generating fingerprint', {
          file: sanitizePath(filePath),
          error: closeError instanceof Error ? closeError.message : String(closeError),
        });
      }
    }
  }

  return hash.digest('hex');
}
