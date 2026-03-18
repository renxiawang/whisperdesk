import { useState, useCallback, useEffect, useRef } from 'react';
import type {
  LiveCaptureOptions,
  LiveTranscriptChunk,
  LiveCaptureStatus,
  TranscriptionSettings,
} from '../../../types';
import {
  startLiveCapture,
  stopLiveCapture,
  onLiveChunk,
  onLiveStatus,
  onLiveError,
  onLiveTranslation,
  onLivePartial,
  onLivePartialTranslation,
} from '../services/liveTranscriptionService';

export interface UseLiveTranscriptionReturn {
  status: LiveCaptureStatus;
  chunks: LiveTranscriptChunk[];
  /** Current in-progress partial transcription (Apple engine only). */
  partialText: string;
  /** Live translation of the current partial (Apple engine only). */
  partialTranslation: string;
  transcript: string;
  error: string | null;
  elapsedSec: number;
  isActive: boolean;
  start: (settings: TranscriptionSettings, engine?: 'whisper' | 'apple') => Promise<void>;
  stop: () => Promise<void>;
  clear: () => void;
}

export function useLiveTranscription(): UseLiveTranscriptionReturn {
  const [status, setStatus] = useState<LiveCaptureStatus>('idle');
  const [chunks, setChunks] = useState<LiveTranscriptChunk[]>([]);
  const [partialText, setPartialText] = useState('');
  const [partialTranslation, setPartialTranslation] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [elapsedSec, setElapsedSec] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef<number>(0);

  // Subscribe to IPC events
  useEffect(() => {
    const unsubChunk = onLiveChunk((chunk: LiveTranscriptChunk) => {
      setChunks((prev) => [...prev, chunk]);
      setPartialText('');
      setPartialTranslation('');
    });

    const unsubStatus = onLiveStatus((s: LiveCaptureStatus) => {
      setStatus(s);
    });

    const unsubError = onLiveError((msg: string) => {
      setError(msg);
    });

    const unsubTranslation = onLiveTranslation(({ index, translation }) => {
      setChunks((prev) => prev.map((c) => (c.index === index ? { ...c, translation } : c)));
    });

    const unsubPartial = onLivePartial((text: string) => {
      setPartialText(text);
    });

    const unsubPartialTranslation = onLivePartialTranslation((translation: string) => {
      setPartialTranslation(translation);
    });

    return () => {
      unsubChunk();
      unsubStatus();
      unsubError();
      unsubTranslation();
      unsubPartial();
      unsubPartialTranslation();
    };
  }, []);

  // Elapsed timer — driven by isActive so it keeps ticking through
  // capturing ↔ transcribing transitions.
  const isActiveForTimer = status === 'capturing' || status === 'transcribing';
  useEffect(() => {
    if (isActiveForTimer) {
      if (!startTimeRef.current) {
        startTimeRef.current = Date.now();
      }
      timerRef.current = setInterval(() => {
        setElapsedSec(Math.floor((Date.now() - startTimeRef.current) / 1000));
      }, 1000);
    } else {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }
    return () => {
      // Null out so the next effect run always creates a fresh interval
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [isActiveForTimer]);

  const transcript = chunks.map((c) => c.text).join('\n\n');

  const isActive = status === 'capturing' || status === 'transcribing' || status === 'stopping';

  const start = useCallback(
    async (settings: TranscriptionSettings, engine: 'whisper' | 'apple' = 'whisper') => {
      setError(null);
      setChunks([]);
      setPartialText('');
      setElapsedSec(0);
      startTimeRef.current = Date.now();

      const options: LiveCaptureOptions = {
        model: settings.model,
        language: settings.language,
        transcriptionEngine: engine,
      };

      const result = await startLiveCapture(options);
      if (!result.success) {
        setError(result.error ?? 'Failed to start live capture');
      }
    },
    []
  );

  const stop = useCallback(async () => {
    const result = await stopLiveCapture();
    if (!result.success) {
      setError(result.error ?? 'Failed to stop live capture');
    }
  }, []);

  const clear = useCallback(() => {
    setChunks([]);
    setPartialText('');
    setPartialTranslation('');
    setError(null);
    setElapsedSec(0);
    startTimeRef.current = 0;
  }, []);

  return {
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
  };
}
