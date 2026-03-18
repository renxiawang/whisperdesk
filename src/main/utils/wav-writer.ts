/**
 * Write a WAV file header for raw PCM data.
 * Format: 16-bit signed LE, mono, 16 kHz — matches whisper.cpp's expected input.
 */

const HEADER_SIZE = 44;

export interface WavParams {
  sampleRate?: number;
  channels?: number;
  bitsPerSample?: number;
}

export function createWavBuffer(pcmData: Buffer, params: WavParams = {}): Buffer {
  const sampleRate = params.sampleRate ?? 16000;
  const channels = params.channels ?? 1;
  const bitsPerSample = params.bitsPerSample ?? 16;

  const byteRate = sampleRate * channels * (bitsPerSample / 8);
  const blockAlign = channels * (bitsPerSample / 8);
  const dataSize = pcmData.length;
  const fileSize = HEADER_SIZE + dataSize - 8;

  const header = Buffer.alloc(HEADER_SIZE);
  let offset = 0;

  header.write('RIFF', offset);
  offset += 4;
  header.writeUInt32LE(fileSize, offset);
  offset += 4;
  header.write('WAVE', offset);
  offset += 4;

  header.write('fmt ', offset);
  offset += 4;
  header.writeUInt32LE(16, offset);
  offset += 4; // fmt chunk size
  header.writeUInt16LE(1, offset);
  offset += 2; // PCM format
  header.writeUInt16LE(channels, offset);
  offset += 2;
  header.writeUInt32LE(sampleRate, offset);
  offset += 4;
  header.writeUInt32LE(byteRate, offset);
  offset += 4;
  header.writeUInt16LE(blockAlign, offset);
  offset += 2;
  header.writeUInt16LE(bitsPerSample, offset);
  offset += 2;

  header.write('data', offset);
  offset += 4;
  header.writeUInt32LE(dataSize, offset);

  return Buffer.concat([header, pcmData]);
}
