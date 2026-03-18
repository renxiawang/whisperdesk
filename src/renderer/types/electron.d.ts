import type {
  TranscriptionProgress,
  TranscriptionOptions,
  TranscriptionResult,
  ModelDownloadProgress,
  SaveFileOptions,
  SaveFileResult,
  GpuInfo,
  ModelInfo,
  SelectedFile,
  AppInfo,
  MemoryUsage,
  Unsubscribe,
  UpdateStatus,
  LiveCaptureOptions,
  LiveTranscriptChunk,
  LiveCaptureStatus,
} from './index';

export interface ModelsListResponse {
  models: ModelInfo[];
}

export interface CancelResult {
  success: boolean;
  message?: string;
}

export interface WhisperCheckResult {
  available: boolean;
  whisperPath?: string;
  backend?: string;
  gpu?: GpuInfo;
  error?: string;
}

export interface ElectronAPI {
  openFile: () => Promise<string | null>;
  openMultipleFiles: () => Promise<string[] | null>;
  saveFile: (options: SaveFileOptions) => Promise<SaveFileResult>;
  getFileInfo: (filePath: string) => Promise<SelectedFile | null>;
  getPathForFile: (file: File) => string;
  listModels: () => Promise<ModelsListResponse>;
  deleteModel: (modelName: string) => Promise<{ success: boolean; error?: string }>;
  getGpuStatus: () => Promise<GpuInfo>;
  checkFFmpeg: () => Promise<boolean>;
  downloadModel: (modelName: string) => Promise<{ success: boolean; model: string; path: string }>;
  onModelDownloadProgress: (callback: (data: ModelDownloadProgress) => void) => Unsubscribe;
  startTranscription: (options: TranscriptionOptions) => Promise<TranscriptionResult>;
  cancelTranscription: () => Promise<CancelResult>;
  onTranscriptionProgress: (callback: (data: TranscriptionProgress) => void) => Unsubscribe;
  getAppInfo: () => Promise<AppInfo>;
  getMemoryUsage: () => Promise<MemoryUsage>;
  trackEvent: (
    eventName: string,
    properties?: Record<string, string | number | boolean>
  ) => Promise<void>;
  openExternal: (url: string) => Promise<void>;
  showItemInFolder: (filePath: string) => Promise<{ success: boolean; error?: string }>;
  onMenuOpenFile: (callback: () => void) => Unsubscribe;
  onMenuSaveFile: (callback: () => void) => Unsubscribe;
  onMenuCopyTranscription: (callback: () => void) => Unsubscribe;
  onMenuStartTranscription: (callback: () => void) => Unsubscribe;
  onMenuCancelTranscription: (callback: () => void) => Unsubscribe;
  onMenuToggleHistory: (callback: () => void) => Unsubscribe;
  // Live system audio capture
  startLiveCapture: (options: LiveCaptureOptions) => Promise<{ success: boolean; error?: string }>;
  stopLiveCapture: () => Promise<{ success: boolean; error?: string }>;
  getLiveCaptureStatus: () => Promise<LiveCaptureStatus>;
  onLiveChunk: (callback: (chunk: LiveTranscriptChunk) => void) => Unsubscribe;
  onLiveStatus: (callback: (status: LiveCaptureStatus) => void) => Unsubscribe;
  onLiveError: (callback: (error: string) => void) => Unsubscribe;
  onLiveTranslation: (
    callback: (data: { index: number; translation: string }) => void
  ) => Unsubscribe;

  onLivePartial: (callback: (text: string) => void) => Unsubscribe;
  onLivePartialTranslation: (callback: (translation: string) => void) => Unsubscribe;

  // Translation backend
  setTranslationBackend: (backend: 'xenova' | 'apple') => Promise<{ success: boolean }>;
  getTranslationBackend: () => Promise<'xenova' | 'apple'>;

  checkForUpdates: () => Promise<{ success: boolean; error?: string }>;
  downloadUpdate: () => Promise<{ success: boolean; error?: string }>;
  installUpdate: () => void;
  onUpdateStatus: (callback: (data: UpdateStatus) => void) => Unsubscribe;
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}

export {};
