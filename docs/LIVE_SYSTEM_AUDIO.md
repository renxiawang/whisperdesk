# Live System Audio Transcription + Translation Pipeline

## Overview

WhisperDesk can capture **system audio** (Zoom, Meet, browser, any app) on macOS 13+ via ScreenCaptureKit, transcribe it in near-real-time using whisper.cpp, and (planned) translate the transcript between Chinese and English using a local LLM.

## Architecture

```
┌──────────────────┐     raw PCM (16 kHz s16le)     ┌───────────────────┐
│  Swift CLI        │ ─────── stdout ──────────────▶ │  Electron Main    │
│  audio-capture    │                                │  live-capture.ts  │
│  (ScreenCaptureKit)│                               │                   │
└──────────────────┘                                 │  ┌─ Buffer PCM ─┐ │
                                                     │  │  15 s chunk  │ │
                                                     │  └──────────────┘ │
                                                     │        │          │
                                                     │        ▼          │
                                                     │  ┌─ WAV writer ─┐ │
                                                     │  │ wav-writer.ts│ │
                                                     │  └──────────────┘ │
                                                     │        │          │
                                                     │        ▼          │
                                                     │  ┌─ whisper-cli ┐ │
                                                     │  │ transcribe   │ │
                                                     │  │ chunk.wav    │ │
                                                     │  └──────────────┘ │
                                                     │        │          │
                                                     │        ▼          │
                                                     │  IPC: live:chunk  │
                                                     └────────┬──────────┘
                                                              │
                                                              ▼
                                                     ┌───────────────────┐
                                                     │  Renderer (React) │
                                                     │  LiveTranscription│
                                                     │  Panel            │
                                                     │                   │
                                                     │  ┌─ Original ───┐ │
                                                     │  │ chunk text   │ │
                                                     │  └──────────────┘ │
                                                     │  ┌─ Translation ┐ │  ◀── future
                                                     │  │ (Qwen 2.5)  │ │
                                                     │  └──────────────┘ │
                                                     └───────────────────┘
```

## Pipeline

1. **Capture** — `bin/audio-capture` (Swift CLI, ScreenCaptureKit)
   - Captures all system audio (or per-display)
   - Outputs raw PCM (16 kHz, mono, 16-bit signed LE) to stdout
   - Signals `READY` on stderr when capture starts
   - Stops cleanly on SIGTERM

2. **Buffer → WAV** — `src/main/services/live-capture.ts` + `src/main/utils/wav-writer.ts`
   - Reads PCM from the Swift process stdout
   - Buffers `chunkDurationSeconds` (default 15 s, ~480 KB) of PCM
   - Keeps `overlapSeconds` (default 2 s) from the previous chunk to avoid cutting words
   - Prepends a WAV header and writes to a temp file

3. **Transcribe** — existing `whisper-cli`
   - Runs on each WAV chunk (same binary/model as file transcription)
   - Returns plain text

4. **Emit** — IPC channels `live:chunk`, `live:status`, `live:error`
   - `LiveTranscriptChunk` includes `text`, `startTimeSec`, `index`, and optional `translation`

5. **Future: Translate** — planned `src/main/services/live-translation.ts`
   - Consumes each `LiveTranscriptChunk`
   - Sends `text` to a local LLM (e.g. Qwen 2.5 7B quantized via llama.cpp)
   - Populates `chunk.translation` and re-emits to renderer
   - See "Translation Pipeline" section below

## File Structure

### New Files

| File                                                                            | Purpose                                                |
| ------------------------------------------------------------------------------- | ------------------------------------------------------ |
| `swift/AudioCapture/main.swift`                                                 | Swift CLI for ScreenCaptureKit audio capture           |
| `scripts/build-audio-capture.sh`                                                | Build script (current arch or universal)               |
| `src/main/services/live-capture.ts`                                             | Main process: spawn capture, buffer, transcribe chunks |
| `src/main/utils/wav-writer.ts`                                                  | PCM → WAV buffer utility                               |
| `src/renderer/features/live-transcription/`                                     | Renderer feature module                                |
| `src/renderer/features/live-transcription/hooks/useLiveTranscription.ts`        | React hook for live state                              |
| `src/renderer/features/live-transcription/services/liveTranscriptionService.ts` | Electron API wrapper                                   |
| `src/renderer/features/live-transcription/components/LiveTranscriptionPanel/`   | UI component                                           |

### Modified Files

| File                                                     | Change                                                                                                      |
| -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `src/shared/types.ts`                                    | `LiveCaptureOptions`, `LiveTranscriptChunk`, `LiveCaptureState`, `TranslationOptions`, `TranslatedChunk`    |
| `src/main/ipc/index.ts`                                  | IPC handlers for `live:start`, `live:stop`, `live:status`; event forwarding                                 |
| `src/preload/index.ts`                                   | `startLiveCapture`, `stopLiveCapture`, `getLiveCaptureStatus`, `onLiveChunk`, `onLiveStatus`, `onLiveError` |
| `src/renderer/types/electron.d.ts`                       | Live API type declarations                                                                                  |
| `src/renderer/App.tsx`                                   | `AppMode` state (`file` / `live`), conditional rendering                                                    |
| `src/renderer/App.css`                                   | Mode toggle styles, `.app-main--live` layout                                                                |
| `src/renderer/components/layout/AppHeader/AppHeader.tsx` | Files/Live toggle tabs                                                                                      |
| `build/entitlements.mac.plist`                           | `com.apple.security.device.screen-capture` entitlement                                                      |
| `package.json`                                           | `build:audio-capture` and `build:audio-capture:universal` scripts                                           |

## Requirements

- **macOS 13.0+** (Ventura) for ScreenCaptureKit audio capture
- **Screen Recording** permission in System Settings → Privacy & Security
- **Xcode Command Line Tools** (`xcode-select --install`) for building the Swift binary
- **FFmpeg** and **whisper-cli** (existing requirements)

## Setup & Usage

```bash
# Build the audio capture binary (once)
npm run build:audio-capture

# Run the app in development
npm run electron:dev

# Switch to "Live" mode in the header, click "Start Capture"
```

## Translation Pipeline (Planned)

### Goal

After each chunk is transcribed, optionally translate between Chinese ↔ English using a local quantized LLM (e.g. Qwen 2.5 7B Q4_K_M via llama.cpp).

### Design

The architecture is ready for this:

1. **Types already support it**:
   - `LiveTranscriptChunk.translation?: string` — populated by translation step
   - `TranslationOptions` — source/target language, model path
   - `TranslatedChunk` — full translation result type

2. **UI already supports it**:
   - `LiveTranscriptionPanel` renders `chunk.translation` in a styled block when present
   - `.live-chunk-translation` CSS class with blue left border for visual distinction

3. **Planned service**: `src/main/services/live-translation.ts`
   - Manage a llama.cpp server process (or CLI per-chunk)
   - Accept `TranslationOptions` and a `LiveTranscriptChunk`
   - Generate translation prompt: `"Translate the following {source} text to {target}:\n{text}"`
   - Return translated text, attach to chunk, re-emit via IPC

4. **Model management**:
   - Download Qwen 2.5 7B GGUF to `models/` (similar to whisper model management)
   - Build llama.cpp binary (similar to `setup:whisper` script)
   - Or use llama-server for persistent inference

5. **Integration points**:
   - After `transcribeWavChunk()` returns text in `live-capture.ts`, pass to translation service
   - Translation runs in parallel with the next chunk's capture
   - Emit updated chunk with translation populated

### Model Options

| Model                | Size    | Speed     | Quality  |
| -------------------- | ------- | --------- | -------- |
| Qwen 2.5 7B Q4_K_M   | ~4.5 GB | Good      | High     |
| Qwen 2.5 3B Q4_K_M   | ~2 GB   | Fast      | Moderate |
| Qwen 2.5 1.5B Q4_K_M | ~1 GB   | Very fast | Basic    |

Recommendation: Start with Qwen 2.5 7B Q4_K_M for quality, offer 3B as a "fast" option.

## Risks & Mitigations

| Risk                                       | Mitigation                                                                           |
| ------------------------------------------ | ------------------------------------------------------------------------------------ |
| Screen Recording permission denied         | Clear error message with link to System Settings                                     |
| Swift compiler not available               | Build script checks for `swiftc` and provides install instructions                   |
| Latency (15 s chunks + transcription time) | Configurable chunk duration; use faster models (tiny/base) for live                  |
| Cut words at chunk boundaries              | 2 s overlap between chunks                                                           |
| Translation adds latency                   | Run translation async, show original text immediately, append translation when ready |
| Large model download                       | Reuse existing model download UI pattern; show progress                              |
