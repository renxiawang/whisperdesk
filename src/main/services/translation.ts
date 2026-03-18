/**
 * Translation service — main-process side.
 *
 * Two backends are supported and can be switched at runtime:
 *
 *   'xenova' (default) — ONNX/WASM via a Worker Thread; offline; ~80 MB models
 *                        downloaded on first use to userData/hf-models/.
 *
 *   'apple'            — macOS 26+ Translation framework via the `apple-translator`
 *                        Swift subprocess; on-device; no model download needed.
 *                        Build first:  npm run build:translator
 *
 * Switch backends via setTranslationBackend() or the live-transcription UI toggle.
 */

import { Worker } from 'worker_threads';
import path from 'path';
import { app } from 'electron';
import {
  translateTextApple,
  warmupAppleTranslator,
  stopAppleTranslator,
} from './translation-apple';

// ---------------------------------------------------------------------------
// Language detection (kept here for callers that need it without translating)
// ---------------------------------------------------------------------------

const CJK_REGEX = /[\u4e00-\u9fff\u3400-\u4dbf\uff00-\uffef]/u;

export function detectChunkLanguage(text: string): 'zh' | 'en' {
  const chars = text.replace(/\s/g, '');
  if (!chars.length) return 'en';
  const cjkCount = [...chars].filter((c) => CJK_REGEX.test(c)).length;
  return cjkCount / chars.length > 0.1 ? 'zh' : 'en';
}

// ---------------------------------------------------------------------------
// Worker management
// ---------------------------------------------------------------------------

let worker: Worker | null = null;
const pending = new Map<number, (result: string | null) => void>();
let nextId = 0;

function getWorkerScriptPath(): string {
  // tsup compiles translation-worker.ts → dist-electron/translation-worker.cjs
  return path.join(__dirname, 'translation-worker.cjs');
}

function spawnWorker(): Worker {
  const w = new Worker(getWorkerScriptPath(), {
    workerData: {
      cacheDir: path.join(app.getPath('userData'), 'hf-models'),
    },
  });

  w.on('message', ({ id, result }: { id: number; result: string | null }) => {
    const resolve = pending.get(id);
    if (resolve) {
      pending.delete(id);
      resolve(result);
    }
  });

  w.on('error', (err) => {
    console.error('[translation] worker error:', err);
    drainPending(null);
    worker = null;
  });

  w.on('exit', (code) => {
    if (code !== 0) {
      console.warn('[translation] worker exited with code', code);
      drainPending(null);
    }
    worker = null;
  });

  return w;
}

function drainPending(result: string | null): void {
  for (const resolve of pending.values()) resolve(result);
  pending.clear();
}

function getWorker(): Worker {
  if (!worker) {
    worker = spawnWorker();
  }
  return worker;
}

// ---------------------------------------------------------------------------
// Backend selector
// ---------------------------------------------------------------------------

export type TranslationBackend = 'xenova' | 'apple';

let activeBackend: TranslationBackend = 'xenova';

export function setTranslationBackend(backend: TranslationBackend): void {
  activeBackend = backend;
  console.log('[translation] backend switched to:', backend);
}

export function getTranslationBackend(): TranslationBackend {
  return activeBackend;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Translate text using the active backend.
 * Never blocks the main-process event loop regardless of backend.
 */
export async function translateText(text: string): Promise<string | null> {
  if (activeBackend === 'apple') {
    return translateTextApple(text);
  }
  // Xenova path — delegate to Worker Thread
  return new Promise((resolve) => {
    const id = nextId++;
    pending.set(id, resolve);
    try {
      getWorker().postMessage({ id, text });
    } catch (_err) {
      pending.delete(id);
      resolve(null);
    }
  });
}

/**
 * Pre-warm the active backend so the first translation request isn't slow.
 * Call this once after app.whenReady().
 */
export function warmupTranslationWorker(): void {
  if (activeBackend === 'apple') {
    warmupAppleTranslator();
    return;
  }
  try {
    getWorker(); // spawns the thread and starts model loading
  } catch (err) {
    console.warn('[translation] failed to start worker:', err);
  }
}

/** Terminate both backends cleanly on app quit. */
export function stopTranslator(): void {
  if (worker) {
    worker.terminate();
    worker = null;
  }
  pending.clear();
  stopAppleTranslator();
}
