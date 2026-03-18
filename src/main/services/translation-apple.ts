/**
 * Apple Translation backend — main-process side.
 *
 * Spawns `bin/apple-translator` (a Swift CLI using the macOS 26 Translation
 * framework) as a persistent child process. Communication happens via JSON
 * lines on stdin/stdout so the Electron main-process event loop is never
 * blocked by translation work.
 *
 * Build the binary first:  npm run build:translator
 * Requirements:            macOS 26+, Xcode with macOS 26 SDK
 */

import type { ChildProcessWithoutNullStreams } from 'child_process';
import { spawn } from 'child_process';
import readline from 'readline';
import path from 'path';
import fs from 'fs';
import { app } from 'electron';

// ---------------------------------------------------------------------------
// Language detection (inlined to avoid circular import with translation.ts)
// ---------------------------------------------------------------------------

const CJK_REGEX = /[\u4e00-\u9fff\u3400-\u4dbf\uff00-\uffef]/u;

function detectLang(text: string): 'zh' | 'en' {
  const chars = text.replace(/\s/g, '');
  if (!chars.length) return 'en';
  const cjkCount = [...chars].filter((c) => CJK_REGEX.test(c)).length;
  return cjkCount / chars.length > 0.1 ? 'zh' : 'en';
}

// ---------------------------------------------------------------------------
// Wire types
// ---------------------------------------------------------------------------

interface AppleRequest {
  id: number;
  text: string;
  from: string; // BCP 47, e.g. "zh-Hans" or "en"
  to: string;
}

interface AppleResponse {
  id: number;
  translation?: string;
  error?: string;
}

// ---------------------------------------------------------------------------
// Process management
// ---------------------------------------------------------------------------

let proc: ChildProcessWithoutNullStreams | null = null;
const pending = new Map<number, (result: string | null) => void>();
let nextId = 0;
let processReady = false;
const readyCallbacks: Array<() => void> = [];

function getBinaryPath(): string {
  if (!app.isPackaged) {
    return path.join(process.cwd(), 'bin', 'apple-translator');
  }
  // asarUnpack extracts bin/ to app.asar.unpacked/bin/
  const unpackedPath = path.join(
    process.resourcesPath,
    'app.asar.unpacked',
    'bin',
    'apple-translator'
  );
  if (fs.existsSync(unpackedPath)) return unpackedPath;
  return path.join(process.resourcesPath, 'bin', 'apple-translator');
}

function spawnProcess(): boolean {
  const binaryPath = getBinaryPath();

  if (!fs.existsSync(binaryPath)) {
    console.warn(
      '[translation-apple] binary not found at',
      binaryPath,
      '— run: npm run build:translator'
    );
    return false;
  }

  proc = spawn(binaryPath, [], { stdio: ['pipe', 'pipe', 'pipe'] });

  // Parse JSON responses line-by-line from stdout
  const rl = readline.createInterface({ input: proc.stdout, crlfDelay: Infinity });

  rl.on('line', (line) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    try {
      const resp: AppleResponse = JSON.parse(trimmed);
      const resolve = pending.get(resp.id);
      if (resolve) {
        pending.delete(resp.id);
        resolve(resp.translation ?? null);
      }
    } catch {
      console.warn('[translation-apple] unparseable stdout:', trimmed);
    }
  });

  proc.stderr.on('data', (chunk: Buffer) => {
    const text = chunk.toString();
    if (text.includes('READY')) {
      processReady = true;
      for (const cb of readyCallbacks) cb();
      readyCallbacks.length = 0;
    } else if (text.trim()) {
      console.log('[translation-apple]', text.trim());
    }
  });

  proc.on('error', (err) => {
    console.error('[translation-apple] spawn error:', err);
    processReady = false;
    proc = null;
    drainPending(null);
  });

  proc.on('exit', (code) => {
    if (code !== 0 && code !== null) {
      console.warn('[translation-apple] process exited with code', code);
    }
    processReady = false;
    proc = null;
    drainPending(null);
  });

  return true;
}

function drainPending(result: string | null): void {
  for (const resolve of pending.values()) resolve(result);
  pending.clear();
}

function whenReady(): Promise<void> {
  if (processReady) return Promise.resolve();
  return new Promise((resolve) => readyCallbacks.push(resolve));
}

// ---------------------------------------------------------------------------
// Public API (mirrors the Xenova backend's interface)
// ---------------------------------------------------------------------------

/**
 * Translate text using the macOS 26 Translation framework.
 * Language direction (zh↔en) is auto-detected.
 */
export async function translateTextApple(text: string): Promise<string | null> {
  if (!proc) {
    const ok = spawnProcess();
    if (!ok) return null;
  }

  await whenReady();

  const lang = detectLang(text);
  const from = lang === 'zh' ? 'zh-Hans' : 'en';
  const to = lang === 'zh' ? 'en' : 'zh-Hans';

  return new Promise((resolve) => {
    const id = nextId++;
    pending.set(id, resolve);
    const req: AppleRequest = { id, text, from, to };
    try {
      proc!.stdin.write(JSON.stringify(req) + '\n');
    } catch (_err) {
      pending.delete(id);
      resolve(null);
    }
  });
}

/** Pre-warm: spawn the process and let it initialise. */
export function warmupAppleTranslator(): void {
  if (!proc) spawnProcess();
}

/** Clean up on app quit. */
export function stopAppleTranslator(): void {
  if (proc) {
    try {
      proc.stdin.end();
    } catch {
      /* ignore */
    }
    proc.kill('SIGTERM');
    proc = null;
  }
  processReady = false;
  drainPending(null);
}
