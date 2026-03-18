/**
 * Live system audio capture and chunked transcription.
 *
 * Pipeline:  Swift audio-capture CLI  →  PCM buffer  →  WAV chunk  →  whisper-cli  →  text
 *            (future)                                                →  LLM translation  →  translated text
 *
 * The Swift binary captures system audio via ScreenCaptureKit and streams
 * raw PCM (16 kHz, mono, s16le) to stdout.  This service buffers the PCM,
 * periodically writes WAV chunks to temp files, and runs whisper-cli on each.
 */

import { spawn } from 'child_process';
import type { ChildProcess } from 'child_process';
import path from 'path';
import fs from 'fs';
import { app } from 'electron';
import os from 'os';
import crypto from 'crypto';
import type {
  LiveCaptureOptions,
  LiveTranscriptChunk,
  LiveCaptureStatus,
  WhisperModelName,
  LanguageCode,
} from '../../shared/types';
import { createWavBuffer } from '../utils/wav-writer';
import { getWhisperBinaryPath, getModelPath, MODELS } from './whisper';
import { translateText } from './translation';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SAMPLE_RATE = 16000;
const CHANNELS = 1;
const BYTES_PER_SAMPLE = 2; // s16le
const BYTES_PER_SECOND = SAMPLE_RATE * CHANNELS * BYTES_PER_SAMPLE;
const DEFAULT_CHUNK_DURATION = 10; // maximum seconds before forced flush
const DEFAULT_OVERLAP = 2; // seconds of overlap on max-duration cuts
const MODEL_ALIASES: Record<string, string> = { large: 'large-v3', turbo: 'large-v3-turbo' };

// Silence / pause detection — lets us cut chunks at natural speech pauses
// rather than always waiting for the full max duration.
const SILENCE_RMS_THRESHOLD = 300; // int16 RMS below this = silence
const SILENCE_TRIGGER_SECS = 0.4; // 400 ms of silence → flush early
const SILENCE_MIN_DURATION_SECS = 3; // don't flush before 3 s of audio
const SILENCE_OVERLAP_SECS = 0.3; // small tail to keep after silence cut
const SILENCE_WINDOW_SECS = 0.05; // analyse RMS in 50 ms windows

/** Compute RMS of a slice of int16 LE PCM data. */
function computeRMS(buf: Buffer, startByte: number, byteCount: number): number {
  const start = startByte & ~1; // align to sample boundary
  const count = byteCount & ~1;
  if (count <= 0) return 0;
  let sumSq = 0;
  for (let i = start; i < start + count; i += 2) {
    const s = buf.readInt16LE(i);
    sumSq += s * s;
  }
  return Math.sqrt(sumSq / (count / 2));
}

// ---------------------------------------------------------------------------
// Event system
// ---------------------------------------------------------------------------

export type LiveCaptureEvent =
  | { type: 'status'; status: LiveCaptureStatus }
  | { type: 'chunk'; payload: LiveTranscriptChunk }
  | { type: 'translation'; index: number; translation: string }
  | { type: 'error'; error: string };

type Listener = (event: LiveCaptureEvent) => void;

const listeners: Set<Listener> = new Set();

function emit(event: LiveCaptureEvent): void {
  for (const fn of listeners) {
    try {
      fn(event);
    } catch (e) {
      console.error('LiveCapture listener error:', e);
    }
  }
}

export function onLiveCaptureEvent(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

let captureProc: ChildProcess | null = null;
let status: LiveCaptureStatus = 'idle';
let stopRequested = false;

// ---------------------------------------------------------------------------
// Binary path
// ---------------------------------------------------------------------------

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;

function getAudioCaptureBinaryPath(): string {
  if (isDev) {
    return path.join(process.cwd(), 'bin', 'audio-capture');
  }
  const unpackedPath = path.join(
    process.resourcesPath,
    'app.asar.unpacked',
    'bin',
    'audio-capture'
  );
  if (fs.existsSync(unpackedPath)) {
    return unpackedPath;
  }
  return path.join(process.resourcesPath, 'bin', 'audio-capture');
}

// ---------------------------------------------------------------------------
// Chunk transcription (lightweight wrapper around whisper-cli)
// ---------------------------------------------------------------------------

// whisper-cli can hang indefinitely on silent/blank audio; this is the max
// we'll wait before killing it.  Generous enough for slow machines + large models.
const WHISPER_TIMEOUT_MS = 60_000;

// Tokens whisper-cli emits instead of real text — treat as empty.
const BLANK_AUDIO_RE = /^\s*(\[BLANK_AUDIO\]\s*)+$/;

function transcribeWavChunk(
  wavPath: string,
  model: WhisperModelName,
  language: LanguageCode
): Promise<string> {
  return new Promise((resolve, reject) => {
    const whisperPath = getWhisperBinaryPath();
    if (!fs.existsSync(whisperPath)) {
      reject(new Error('whisper-cli not found. Run: npm run setup:whisper'));
      return;
    }

    const actualModel = MODEL_ALIASES[model] || model || 'base';
    let modelPath: string;
    try {
      modelPath = getModelPath(actualModel);
    } catch (err) {
      reject(err);
      return;
    }
    if (!fs.existsSync(modelPath)) {
      reject(new Error(`Model '${actualModel}' not downloaded.`));
      return;
    }

    const cpuCount = os.cpus().length;
    const args = [
      '-m',
      modelPath,
      '-f',
      wavPath,
      '--no-timestamps',
      '-t',
      String(Math.min(cpuCount, 8)),
    ];
    if (language) {
      args.push('-l', language);
    }

    const child = spawn(whisperPath, args);
    let stdout = '';
    let stderr = '';
    let settled = false;

    // Safety net: kill whisper-cli if it hangs (common on blank/silent audio)
    const killTimer = setTimeout(() => {
      if (!settled) {
        child.kill('SIGKILL');
        settle(() => reject(new Error('whisper-cli timed out after 60 s')));
      }
    }, WHISPER_TIMEOUT_MS);

    function settle(fn: () => void): void {
      if (settled) return;
      settled = true;
      clearTimeout(killTimer);
      fn();
    }

    child.stdout.on('data', (d: Buffer) => {
      stdout += d.toString();
    });
    child.stderr.on('data', (d: Buffer) => {
      stderr += d.toString();
    });

    child.on('close', (code) => {
      settle(() => {
        if (code === 0) {
          const text = stdout.trim();
          // Filter blank-audio tokens so callers treat them as empty
          resolve(BLANK_AUDIO_RE.test(text) ? '' : text);
        } else {
          reject(new Error(stderr || `whisper-cli exited with code ${code}`));
        }
      });
    });
    child.on('error', (err) => settle(() => reject(err)));
  });
}

// ---------------------------------------------------------------------------
// Start / Stop
// ---------------------------------------------------------------------------

export async function startLiveCapture(options: LiveCaptureOptions): Promise<void> {
  if (status !== 'idle') {
    throw new Error('Live capture is already running');
  }

  const binaryPath = getAudioCaptureBinaryPath();
  if (!fs.existsSync(binaryPath)) {
    throw new Error('audio-capture binary not found. Run: npm run build:audio-capture');
  }

  // Validate model
  const actualModel = MODEL_ALIASES[options.model] || options.model || 'base';
  if (!MODELS[actualModel]) {
    throw new Error(`Unknown model: ${options.model}`);
  }
  let modelPath: string;
  try {
    modelPath = getModelPath(actualModel);
  } catch (err) {
    throw new Error(`Invalid model: ${err instanceof Error ? err.message : String(err)}`);
  }
  if (!fs.existsSync(modelPath)) {
    throw new Error(`Model '${actualModel}' not downloaded. Download it first.`);
  }

  const chunkDuration = options.chunkDurationSeconds ?? DEFAULT_CHUNK_DURATION;
  const overlapSec = options.overlapSeconds ?? DEFAULT_OVERLAP;
  const maxChunkBytes = chunkDuration * BYTES_PER_SECOND;
  const overlapBytes = overlapSec * BYTES_PER_SECOND;
  const silenceOverlapBytes = SILENCE_OVERLAP_SECS * BYTES_PER_SECOND;
  const silenceWindowBytes = Math.floor(SILENCE_WINDOW_SECS * BYTES_PER_SECOND) & ~1;
  const silenceTriggerBytes = SILENCE_TRIGGER_SECS * BYTES_PER_SECOND;
  const silenceMinBytes = SILENCE_MIN_DURATION_SECS * BYTES_PER_SECOND;

  stopRequested = false;
  status = 'capturing';
  emit({ type: 'status', status: 'capturing' });

  const proc = spawn(binaryPath, [], { stdio: ['pipe', 'pipe', 'pipe'] });
  captureProc = proc;

  let pcmBuffer = Buffer.alloc(0);
  let chunkIndex = 0;
  let processingChunk = false;
  let stderrAccum = '';

  // Silence tracking (reset when a chunk is flushed)
  let silentBytesAtEnd = 0; // consecutive silent bytes at the tail of pcmBuffer
  let lastSpeechByte = 0; // byte offset in pcmBuffer of last detected speech

  function updateSilenceTracking(newData: Buffer): void {
    for (let i = 0; i < newData.length; i += silenceWindowBytes) {
      const windowSize = Math.min(silenceWindowBytes, newData.length - i);
      const rms = computeRMS(newData, i, windowSize);
      if (rms > SILENCE_RMS_THRESHOLD) {
        silentBytesAtEnd = 0;
        // position within the full pcmBuffer where speech was detected
        lastSpeechByte = pcmBuffer.length - newData.length + i + windowSize;
      } else {
        silentBytesAtEnd += windowSize;
      }
    }
  }

  proc.stderr?.on('data', (data: Buffer) => {
    stderrAccum += data.toString();
  });

  // Wait for READY on stderr (or explicit ERROR:)
  const readyPromise = new Promise<void>((resolve, reject) => {
    const checkStderr = () => {
      if (stderrAccum.includes('READY')) {
        resolve();
      }
      if (stderrAccum.includes('ERROR:')) {
        const msg =
          stderrAccum.match(/ERROR: (.+)/m)?.[1]?.trim() ??
          (stderrAccum.trim() || 'Unknown capture error');
        reject(new Error(msg));
      }
    };
    proc.stderr?.on('data', () => checkStderr());

    proc.on('error', (err) => reject(err));
    proc.on('close', (code, signal) => {
      if (status === 'idle') return;
      const stderrSnippet = stderrAccum.trim().slice(-800);
      const hint =
        code === null && !stderrSnippet
          ? ' The process was likely killed by the system. Grant Screen Recording permission to this app in System Settings → Privacy & Security → Screen Recording (and, if you run from Terminal/Cursor, add that app too), then try again.'
          : stderrSnippet
            ? ` Output: ${stderrSnippet}`
            : '';
      reject(
        new Error(
          `audio-capture exited unexpectedly (code ${code ?? 'null'}${signal ? `, signal ${signal}` : ''}).${hint}`
        )
      );
    });

    setTimeout(() => reject(new Error('audio-capture did not become ready within 10 s')), 10000);
  });

  try {
    await readyPromise;
  } catch (err) {
    cleanup();
    throw err;
  }

  // Read PCM from stdout and buffer
  proc.stdout?.on('data', (data: Buffer) => {
    // Update silence tracking BEFORE extending buffer so offsets align
    updateSilenceTracking(data);
    pcmBuffer = Buffer.concat([pcmBuffer, data]);
    maybeProcessChunk();
  });

  // Handle unexpected close after we've started (e.g. process killed mid-capture)
  proc.on('close', (code, signal) => {
    if (!stopRequested && status !== 'idle') {
      status = 'error';
      const stderrSnippet = stderrAccum.trim().slice(-500);
      const hint =
        code === null && !stderrSnippet
          ? ' Process was likely killed. Ensure Screen Recording permission is granted (System Settings → Privacy & Security → Screen Recording).'
          : stderrSnippet
            ? ` ${stderrSnippet}`
            : '';
      emit({
        type: 'error',
        error: `audio-capture exited unexpectedly (code ${code ?? 'null'}${signal ? `, signal ${signal}` : ''}).${hint}`,
      });
      emit({ type: 'status', status: 'error' });
      cleanup();
    }
  });

  async function maybeProcessChunk(): Promise<void> {
    if (processingChunk || stopRequested) return;

    const maxDurationReached = pcmBuffer.length >= maxChunkBytes;
    const silencePauseDetected =
      pcmBuffer.length >= silenceMinBytes && silentBytesAtEnd >= silenceTriggerBytes;

    if (!maxDurationReached && !silencePauseDetected) return;

    processingChunk = true;
    status = 'transcribing';
    emit({ type: 'status', status: 'transcribing' });

    // Determine where to cut this chunk.
    // On a silence-triggered cut, end just past the last detected speech so the
    // transcription sees a clean sentence end. On a max-duration cut, use the
    // full window plus the standard overlap for the next chunk.
    let chunkEnd: number;
    let keepFromEnd: number;

    if (silencePauseDetected && !maxDurationReached) {
      // Include a small tail after last speech to preserve natural endings
      chunkEnd = Math.min(lastSpeechByte + Math.floor(0.1 * BYTES_PER_SECOND), pcmBuffer.length);
      chunkEnd = chunkEnd & ~1; // align to sample boundary
      keepFromEnd = Math.floor(silenceOverlapBytes) & ~1;
    } else {
      chunkEnd = maxChunkBytes;
      keepFromEnd = Math.floor(overlapBytes) & ~1;
    }

    const chunkPcm = pcmBuffer.subarray(0, chunkEnd);
    // Retain a short overlap so whisper doesn't miss words at the boundary
    const remainStart = Math.max(0, chunkEnd - keepFromEnd);
    pcmBuffer = pcmBuffer.subarray(remainStart);

    // Reset silence tracking for the freshly retained buffer slice
    silentBytesAtEnd = 0;
    lastSpeechByte = 0;

    const currentIndex = chunkIndex++;
    const startTimeSec =
      currentIndex === 0 ? 0 : Math.max(0, currentIndex * chunkDuration - overlapSec);

    const wavPath = path.join(app.getPath('temp'), `whisperdesk_live_${crypto.randomUUID()}.wav`);

    try {
      const wavData = createWavBuffer(chunkPcm);
      fs.writeFileSync(wavPath, wavData);

      const text = await transcribeWavChunk(wavPath, options.model, options.language);

      if (text && !stopRequested) {
        emit({
          type: 'chunk',
          payload: { text, startTimeSec, index: currentIndex },
        });

        // Translate async — does not block the next chunk from starting
        translateText(text)
          .then((translation) => {
            if (translation && !stopRequested) {
              emit({ type: 'translation', index: currentIndex, translation });
            }
          })
          .catch(() => {
            /* translation errors are non-fatal */
          });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      emit({ type: 'error', error: `Chunk transcription failed: ${msg}` });
    } finally {
      try {
        if (fs.existsSync(wavPath)) fs.unlinkSync(wavPath);
      } catch {
        /* ignore */
      }
      processingChunk = false;
      if (!stopRequested && status === 'transcribing') {
        status = 'capturing';
        emit({ type: 'status', status: 'capturing' });
      }
      // Process next chunk immediately if buffer already qualifies
      maybeProcessChunk();
    }
  }

  function cleanup(): void {
    captureProc = null;
    pcmBuffer = Buffer.alloc(0);
    status = 'idle';
  }
}

export async function stopLiveCapture(): Promise<void> {
  if (status === 'idle' || !captureProc) {
    return;
  }

  stopRequested = true;
  status = 'stopping';
  emit({ type: 'status', status: 'stopping' });

  const proc = captureProc;
  captureProc = null;

  return new Promise<void>((resolve) => {
    const timeout = setTimeout(() => {
      proc.kill('SIGKILL');
      finish();
    }, 5000);

    proc.on('close', () => {
      clearTimeout(timeout);
      finish();
    });

    proc.kill('SIGTERM');

    function finish(): void {
      status = 'idle';
      emit({ type: 'status', status: 'idle' });
      resolve();
    }
  });
}

export function getLiveCaptureStatus(): LiveCaptureStatus {
  return status;
}

export function isLiveCaptureActive(): boolean {
  return status !== 'idle' && status !== 'error';
}
