/**
 * Live transcription via Apple Speech framework (on-device SFSpeechRecognizer).
 *
 * Spawns `bin/speech-capture` — a Swift CLI that combines ScreenCaptureKit
 * (system audio) with SFSpeechRecognizer — and forwards its streaming JSON
 * output as Electron IPC events.  Mirrors the interface of live-capture.ts so
 * the IPC layer can swap engines transparently.
 *
 * Build the binary first:  npm run build:speech-capture
 * Requirements:            macOS 13+, Screen Recording + Speech Recognition
 *                          permissions granted to WhisperDesk.
 *
 * stdout protocol (JSON lines):
 *   {"type":"partial","text":"...","segmentId":N}
 *   {"type":"final",  "text":"...","segmentId":N}
 */

import type { ChildProcess } from 'child_process';
import { spawn } from 'child_process';
import readline from 'readline';
import path from 'path';
import fs from 'fs';
import { app } from 'electron';
import { translateText } from './translation';
import type {
  LiveCaptureOptions,
  LiveTranscriptChunk,
  LiveCaptureStatus,
} from '../../shared/types';

// ---------------------------------------------------------------------------
// Language mapping  (LiveCaptureOptions.language → BCP 47 locale)
// ---------------------------------------------------------------------------

const LOCALE_MAP: Record<string, string> = {
  auto: 'zh-Hans', // SFSpeechRecognizer needs a specific locale; zh-Hans handles
  // Chinese and common English code-switching in mixed meetings.
  en: 'en-US',
  zh: 'zh-Hans',
  fr: 'fr-FR',
  de: 'de-DE',
  ja: 'ja-JP',
  ko: 'ko-KR',
  es: 'es-ES',
  pt: 'pt-BR',
  it: 'it-IT',
  ru: 'ru-RU',
  ar: 'ar-SA',
};

function toLocale(lang: string): string {
  if (!lang) return 'zh-Hans';
  return LOCALE_MAP[lang] ?? lang;
}

// ---------------------------------------------------------------------------
// Event system (same shape as live-capture.ts)
// ---------------------------------------------------------------------------

export type AppleLiveEvent =
  | { type: 'status'; status: LiveCaptureStatus }
  | { type: 'partial'; text: string }
  | { type: 'partialTranslation'; translation: string }
  | { type: 'chunk'; payload: LiveTranscriptChunk }
  | { type: 'translation'; index: number; translation: string }
  | { type: 'error'; error: string };

type Listener = (event: AppleLiveEvent) => void;
const listeners: Set<Listener> = new Set();

function emit(event: AppleLiveEvent): void {
  for (const fn of listeners) {
    try {
      fn(event);
    } catch (e) {
      console.error('[live-apple] listener error:', e);
    }
  }
}

export function onAppleLiveCaptureEvent(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

// ---------------------------------------------------------------------------
// Binary path
// ---------------------------------------------------------------------------

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;

function getBinaryPath(): string {
  if (isDev) return path.join(process.cwd(), 'bin', 'speech-capture');
  const unpacked = path.join(process.resourcesPath, 'app.asar.unpacked', 'bin', 'speech-capture');
  if (fs.existsSync(unpacked)) return unpacked;
  return path.join(process.resourcesPath, 'bin', 'speech-capture');
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

let captureProc: ChildProcess | null = null;
let status: LiveCaptureStatus = 'idle';
let stopRequested = false;
let chunkIndex = 0;
let startedAt = 0;

// Partial translation debounce — fires 300 ms after last partial update
let partialTranslateTimer: ReturnType<typeof setTimeout> | null = null;
let partialTranslateGen = 0;

function schedulePartialTranslation(text: string): void {
  if (partialTranslateTimer) clearTimeout(partialTranslateTimer);
  const gen = ++partialTranslateGen;
  partialTranslateTimer = setTimeout(async () => {
    if (stopRequested || gen !== partialTranslateGen) return;
    const translation = await translateText(text).catch(() => null);
    if (translation && !stopRequested && gen === partialTranslateGen) {
      emit({ type: 'partialTranslation', translation });
    }
  }, 300);
}

function cancelPartialTranslation(): void {
  if (partialTranslateTimer) {
    clearTimeout(partialTranslateTimer);
    partialTranslateTimer = null;
  }
  partialTranslateGen++; // invalidate any in-flight request
}

// ---------------------------------------------------------------------------
// Public API (mirrors live-capture.ts)
// ---------------------------------------------------------------------------

export async function startAppleLiveCapture(options: LiveCaptureOptions): Promise<void> {
  if (status !== 'idle') throw new Error('Apple live capture is already running');

  const binaryPath = getBinaryPath();
  if (!fs.existsSync(binaryPath)) {
    throw new Error('speech-capture binary not found. Run: npm run build:speech-capture');
  }

  stopRequested = false;
  chunkIndex = 0;
  startedAt = Date.now();

  const locale = toLocale(options.language ?? 'auto');

  return new Promise<void>((resolve, reject) => {
    const proc = spawn(binaryPath, ['--language', locale], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    captureProc = proc;

    let stderrBuf = '';

    // Parse JSON lines from stdout
    const rl = readline.createInterface({ input: proc.stdout!, crlfDelay: Infinity });

    rl.on('line', (line) => {
      const trimmed = line.trim();
      if (!trimmed) return;
      try {
        const msg = JSON.parse(trimmed) as { type: string; text?: string; message?: string };
        if (msg.type === 'partial' && msg.text) {
          emit({ type: 'partial', text: msg.text });
          schedulePartialTranslation(msg.text);
        } else if (msg.type === 'final' && msg.text) {
          // Cancel any pending partial translation and clear it from the UI
          cancelPartialTranslation();
          emit({ type: 'partialTranslation', translation: '' });

          const text = msg.text;
          const currentIdx = chunkIndex++;
          const startTimeSec = (Date.now() - startedAt) / 1000;

          emit({
            type: 'chunk',
            payload: { text, startTimeSec, index: currentIdx },
          });

          // Translate the final segment (full accuracy, not debounced)
          translateText(text)
            .then((translation) => {
              if (translation && !stopRequested) {
                emit({ type: 'translation', index: currentIdx, translation });
              }
            })
            .catch(() => {
              /* non-fatal */
            });
        } else if (msg.type === 'error' && msg.message) {
          emit({ type: 'error', error: msg.message });
        }
      } catch {
        console.warn('[live-apple] unparseable stdout:', trimmed);
      }
    });

    let rejected = false;
    const doReject = (err: Error) => {
      if (!rejected) {
        rejected = true;
        reject(err);
      }
    };

    proc.stderr!.on('data', (chunk: Buffer) => {
      const text = chunk.toString();
      stderrBuf += text;
      // Log all stderr for debugging
      for (const line of text.split('\n').filter(Boolean)) {
        console.log('[speech-capture]', line);
      }

      if (text.includes('READY')) {
        status = 'capturing';
        emit({ type: 'status', status: 'capturing' });
        resolve();
      } else if (text.includes('STOPPED')) {
        // normal shutdown — handled in 'exit'
      } else if (text.includes('ERROR')) {
        const msg = stderrBuf.match(/ERROR: (.+)/)?.[1]?.trim() ?? 'Unknown capture error';
        if (status === 'idle') {
          doReject(new Error(msg));
        } else {
          emit({ type: 'error', error: msg });
        }
      }
    });

    proc.on('exit', (code, signal) => {
      if (status === 'idle') {
        const detail = signal ? `signal ${signal}` : `code ${code ?? 'null'}`;
        const hint =
          signal === 'SIGKILL'
            ? ' — macOS killed the process. Make sure WhisperDesk has Speech Recognition permission in System Settings → Privacy & Security → Speech Recognition.'
            : '';
        const stderrHint = stderrBuf.trim() ? ` Last output: ${stderrBuf.trim()}` : '';
        doReject(
          new Error(`speech-capture exited before becoming ready (${detail})${hint}${stderrHint}`)
        );
        return;
      }
      captureProc = null;
      status = 'idle';
      emit({ type: 'status', status: 'idle' });
    });

    proc.on('error', (err) => {
      captureProc = null;
      status = 'idle';
      doReject(err);
    });

    setTimeout(() => {
      if (status === 'idle') {
        reject(new Error('speech-capture did not become ready within 15 s'));
      }
    }, 15_000);
  });
}

export async function stopAppleLiveCapture(): Promise<void> {
  if (!captureProc || status === 'idle') return;
  stopRequested = true;
  cancelPartialTranslation();
  status = 'stopping';
  emit({ type: 'status', status: 'stopping' });
  captureProc.kill('SIGTERM');

  return new Promise<void>((resolve) => {
    const timeout = setTimeout(() => {
      captureProc?.kill('SIGKILL');
      resolve();
    }, 5_000);

    captureProc?.on('exit', () => {
      clearTimeout(timeout);
      resolve();
    });
  });
}

export function getAppleLiveCaptureStatus(): LiveCaptureStatus {
  return status;
}
