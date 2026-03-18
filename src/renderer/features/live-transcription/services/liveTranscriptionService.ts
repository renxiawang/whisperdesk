import type {
  LiveCaptureOptions,
  LiveTranscriptChunk,
  LiveCaptureStatus,
  Unsubscribe,
} from '../../../types';

function getAPI() {
  const api = window.electronAPI;
  if (!api) throw new Error('electronAPI not available');
  return api;
}

export async function startLiveCapture(
  options: LiveCaptureOptions
): Promise<{ success: boolean; error?: string }> {
  return getAPI().startLiveCapture(options);
}

export async function stopLiveCapture(): Promise<{ success: boolean; error?: string }> {
  return getAPI().stopLiveCapture();
}

export async function getLiveCaptureStatus(): Promise<LiveCaptureStatus> {
  return getAPI().getLiveCaptureStatus();
}

export function onLiveChunk(callback: (chunk: LiveTranscriptChunk) => void): Unsubscribe {
  return getAPI().onLiveChunk(callback);
}

export function onLiveStatus(callback: (status: LiveCaptureStatus) => void): Unsubscribe {
  return getAPI().onLiveStatus(callback);
}

export function onLiveError(callback: (error: string) => void): Unsubscribe {
  return getAPI().onLiveError(callback);
}

export function onLiveTranslation(
  callback: (data: { index: number; translation: string }) => void
): Unsubscribe {
  return getAPI().onLiveTranslation(callback);
}

export function onLivePartial(callback: (text: string) => void): Unsubscribe {
  return getAPI().onLivePartial(callback);
}

export function onLivePartialTranslation(callback: (translation: string) => void): Unsubscribe {
  return getAPI().onLivePartialTranslation(callback);
}
