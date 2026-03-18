import React, { useRef, useEffect, useState, useCallback } from 'react';
import { Mic, Square, Trash2, Copy, Save, AlertCircle } from 'lucide-react';
import { Button, HighlightedText } from '../../../../components/ui';
import { useLiveTranscription } from '../../hooks';
import { useCopyToClipboard } from '../../../../hooks';
import type { TranscriptionSettings } from '../../../../types';
import './LiveTranscriptionPanel.css';

interface LiveTranscriptionPanelProps {
  settings: TranscriptionSettings;
  modelDownloaded: boolean;
  onSave?: (text: string) => void;
}

function formatElapsed(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function LiveTranscriptionPanel({
  settings,
  modelDownloaded,
  onSave,
}: LiveTranscriptionPanelProps): React.JSX.Element {
  const {
    status,
    chunks,
    partialText,
    partialTranslation,
    transcript,
    error,
    elapsedSec,
    isActive,
    start,
    stop,
    clear,
  } = useLiveTranscription();
  const { copySuccess, copyToClipboard } = useCopyToClipboard();
  const transcriptEndRef = useRef<HTMLDivElement>(null);

  const [transcriptionEngine, setTranscriptionEngine] = useState<'whisper' | 'apple'>('whisper');
  const [translationBackend, setTranslationBackendState] = useState<'xenova' | 'apple'>('xenova');

  // Sync initial backend value from main process
  useEffect(() => {
    window.electronAPI?.getTranslationBackend().then((b) => setTranslationBackendState(b));
  }, []);

  const handleBackendChange = useCallback(async (backend: 'xenova' | 'apple') => {
    await window.electronAPI?.setTranslationBackend(backend);
    setTranslationBackendState(backend);
  }, []);

  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chunks.length, partialText, partialTranslation]);

  const handleStart = async () => {
    await start(settings, transcriptionEngine);
  };

  const handleCopy = async () => {
    if (transcript) {
      await copyToClipboard(transcript);
    }
  };

  const handleSave = () => {
    if (transcript && onSave) {
      onSave(transcript);
    }
  };

  const canStart = !isActive && modelDownloaded;

  return (
    <div className="live-transcription-panel">
      {/* Controls */}
      <div className="live-controls">
        <div className="live-controls-left">
          {!isActive ? (
            <Button
              variant="primary"
              icon={<Mic size={16} />}
              onClick={handleStart}
              disabled={!canStart}
              aria-label="Start live capture"
              title={!modelDownloaded ? 'Download a model first' : 'Start capturing system audio'}
            >
              Start Capture
            </Button>
          ) : (
            <Button
              variant="danger"
              icon={<Square size={16} />}
              onClick={stop}
              disabled={status === 'stopping'}
              aria-label="Stop live capture"
            >
              {status === 'stopping' ? 'Stopping...' : 'Stop'}
            </Button>
          )}
        </div>

        <div className="live-controls-right">
          {/* Transcription engine toggle */}
          <div className="live-backend-toggle" title="Transcription engine">
            <button
              className={`live-backend-btn${transcriptionEngine === 'whisper' ? ' live-backend-btn--active' : ''}`}
              onClick={() => setTranscriptionEngine('whisper')}
              disabled={isActive}
              title="Whisper (high accuracy, chunked)"
            >
              Whisper
            </button>
            <button
              className={`live-backend-btn${transcriptionEngine === 'apple' ? ' live-backend-btn--active' : ''}`}
              onClick={() => setTranscriptionEngine('apple')}
              disabled={isActive}
              title="Apple Speech (streaming, low latency, macOS 13+)"
            >
              Apple
            </button>
          </div>

          {/* Translation backend toggle */}
          <div className="live-backend-toggle" title="Translation backend">
            <button
              className={`live-backend-btn${translationBackend === 'xenova' ? ' live-backend-btn--active' : ''}`}
              onClick={() => handleBackendChange('xenova')}
              disabled={isActive}
              title="Xenova (offline ONNX/WASM, no build needed)"
            >
              Xenova
            </button>
            <button
              className={`live-backend-btn${translationBackend === 'apple' ? ' live-backend-btn--active' : ''}`}
              onClick={() => handleBackendChange('apple')}
              disabled={isActive}
              title="Apple Translation (macOS 26+, native on-device)"
            >
              Apple
            </button>
          </div>

          {isActive && (
            <span className="live-status-badge" data-status={status}>
              <span className="live-dot" />
              {status === 'transcribing' ? 'Transcribing...' : 'Capturing'}
              <span className="live-elapsed">{formatElapsed(elapsedSec)}</span>
            </span>
          )}
          {!isActive && transcript && (
            <>
              <Button
                variant="icon"
                icon={<Copy size={16} />}
                iconOnly
                onClick={handleCopy}
                aria-label={copySuccess ? 'Copied!' : 'Copy transcript'}
                title={copySuccess ? 'Copied!' : 'Copy to clipboard'}
              />
              {onSave && (
                <Button
                  variant="icon"
                  icon={<Save size={16} />}
                  iconOnly
                  onClick={handleSave}
                  aria-label="Save transcript"
                  title="Save transcript"
                />
              )}
              <Button
                variant="icon"
                icon={<Trash2 size={16} />}
                iconOnly
                onClick={clear}
                aria-label="Clear transcript"
                title="Clear"
              />
            </>
          )}
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="live-error" role="alert">
          <AlertCircle size={14} />
          <span>{error}</span>
        </div>
      )}

      {/* Transcript area */}
      <div className="live-transcript-area">
        {chunks.length === 0 && !isActive && (
          <div className="live-placeholder">
            <Mic size={32} />
            <p>Capture system audio from Zoom, Meet, or any app.</p>
            <p className="live-placeholder-hint">
              Requires macOS 13+. Before starting, grant <strong>Screen Recording</strong> to
              WhisperDesk (and to Terminal or Cursor if you launched from there) in System Settings
              → Privacy &amp; Security → Screen Recording.
            </p>
          </div>
        )}

        {chunks.length === 0 && isActive && (
          <div className="live-placeholder">
            <span className="live-dot live-dot-lg" />
            <p>Listening... transcript will appear after the first chunk is processed.</p>
          </div>
        )}

        {(chunks.length > 0 || partialText) && (
          <div className="live-transcript-content">
            {chunks.map((chunk) => (
              <div key={chunk.index} className="live-chunk">
                <span className="live-chunk-time">
                  {formatElapsed(Math.round(chunk.startTimeSec))}
                </span>
                <p className="live-chunk-text">
                  <span className="live-chunk-label">Original: </span>
                  <HighlightedText text={chunk.text} />
                </p>
                {chunk.translation && (
                  <p className="live-chunk-text live-chunk-text--translation">
                    <span className="live-chunk-label">Translation: </span>
                    <span className="live-chunk-translation">
                      <HighlightedText text={chunk.translation} />
                    </span>
                  </p>
                )}
              </div>
            ))}
            {partialText && (
              <div className="live-chunk live-chunk--partial">
                <p className="live-chunk-text live-chunk-text--partial">
                  <span className="live-chunk-label">Original: </span>
                  <HighlightedText text={partialText} />
                </p>
                {partialTranslation && (
                  <p className="live-chunk-text live-chunk-text--translation live-chunk-text--partial">
                    <span className="live-chunk-label">Translation: </span>
                    <span className="live-chunk-translation">
                      <HighlightedText text={partialTranslation} />
                    </span>
                  </p>
                )}
              </div>
            )}
            <div ref={transcriptEndRef} />
          </div>
        )}
      </div>
    </div>
  );
}

export { LiveTranscriptionPanel };
