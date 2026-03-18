/**
 * Worker-thread counterpart to translation.ts.
 *
 * Runs on its own OS thread so ONNX/WASM inference never blocks the Electron
 * main-process event loop.  Receives { id, text } messages and replies with
 * { id, result } messages.
 */

import { parentPort, workerData } from 'worker_threads';
import path from 'path';

// ---------------------------------------------------------------------------
// Init data passed from the main thread
// ---------------------------------------------------------------------------

interface WorkerInit {
  cacheDir: string; // absolute path to store downloaded HF models
}

const { cacheDir } = (workerData ?? {}) as WorkerInit;

// ---------------------------------------------------------------------------
// Language detection (duplicated here so the worker is self-contained)
// ---------------------------------------------------------------------------

const CJK_REGEX = /[\u4e00-\u9fff\u3400-\u4dbf\uff00-\uffef]/u;

function detectLang(text: string): 'zh' | 'en' {
  const chars = text.replace(/\s/g, '');
  if (!chars.length) return 'en';
  const cjk = [...chars].filter((c) => CJK_REGEX.test(c)).length;
  return cjk / chars.length > 0.1 ? 'zh' : 'en';
}

// ---------------------------------------------------------------------------
// Pipeline state
// ---------------------------------------------------------------------------

type TranslationPipeline = (text: string) => Promise<Array<{ translation_text: string }>>;

const pipelines: Record<string, TranslationPipeline | null> = {
  'zh-en': null,
  'en-zh': null,
};

let loadPromise: Promise<void> | null = null;
let loadFailed = false;

async function loadPipelines(): Promise<void> {
  if (loadFailed) return;
  if (loadPromise) return loadPromise;

  loadPromise = (async () => {
    try {
      const xeno = await import('@xenova/transformers');
      const { pipeline, env } = xeno;

      env.cacheDir = cacheDir ?? path.join(process.cwd(), 'hf-models');
      env.localModelPath = '';

      console.log('[translation-worker] loading OPUS-MT models…');

      const [zhEn, enZh] = await Promise.all([
        pipeline('translation', 'Xenova/opus-mt-zh-en'),
        pipeline('translation', 'Xenova/opus-mt-en-zh'),
      ]);

      pipelines['zh-en'] = zhEn as unknown as TranslationPipeline;
      pipelines['en-zh'] = enZh as unknown as TranslationPipeline;

      console.log('[translation-worker] models ready.');
    } catch (err) {
      console.warn('[translation-worker] failed to load models:', err);
      loadFailed = true;
    }
  })();

  return loadPromise;
}

// Start loading as soon as the worker thread spins up
loadPipelines().catch(() => {});

// ---------------------------------------------------------------------------
// Message loop
// ---------------------------------------------------------------------------

parentPort?.on('message', async ({ id, text }: { id: number; text: string }) => {
  if (loadFailed) {
    parentPort?.postMessage({ id, result: null });
    return;
  }

  try {
    await loadPipelines();

    const key = detectLang(text) === 'zh' ? 'zh-en' : 'en-zh';
    const fn = pipelines[key];

    if (!fn) {
      parentPort?.postMessage({ id, result: null });
      return;
    }

    const results = await fn(text);
    const joined = results
      .map((r) => r.translation_text?.trim())
      .filter(Boolean)
      .join(' ');

    parentPort?.postMessage({ id, result: joined || null });
  } catch (err) {
    console.warn('[translation-worker] error:', err);
    parentPort?.postMessage({ id, result: null });
  }
});
