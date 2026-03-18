import { contextBridge, ipcRenderer, webUtils } from 'electron';
import type {
  TranscriptionOptions,
  SaveFileOptions,
  ModelDownloadProgress,
  TranscriptionProgress,
  UpdateStatus,
  LiveCaptureOptions,
  LiveTranscriptChunk,
  LiveCaptureStatus,
} from '../shared/types';

contextBridge.exposeInMainWorld('electronAPI', {
  openFile: () => ipcRenderer.invoke('dialog:openFile'),
  openMultipleFiles: () => ipcRenderer.invoke('dialog:openMultipleFiles'),
  saveFile: (options: SaveFileOptions) => ipcRenderer.invoke('dialog:saveFile', options),

  getFileInfo: (filePath: string) => ipcRenderer.invoke('file:getInfo', filePath),
  getPathForFile: (file: File) => webUtils.getPathForFile(file),

  listModels: () => ipcRenderer.invoke('models:list'),
  getGpuStatus: () => ipcRenderer.invoke('models:gpuStatus'),
  checkFFmpeg: () => ipcRenderer.invoke('system:checkFFmpeg'),
  downloadModel: (modelName: string) => ipcRenderer.invoke('models:download', modelName),
  deleteModel: (modelName: string) => ipcRenderer.invoke('models:delete', modelName),
  onModelDownloadProgress: (callback: (data: ModelDownloadProgress) => void) => {
    ipcRenderer.on('models:downloadProgress', (_event, data) => callback(data));
    return () => ipcRenderer.removeAllListeners('models:downloadProgress');
  },

  startTranscription: (options: TranscriptionOptions) =>
    ipcRenderer.invoke('transcribe:start', options),
  cancelTranscription: () => ipcRenderer.invoke('transcribe:cancel'),
  onTranscriptionProgress: (callback: (data: TranscriptionProgress) => void) => {
    ipcRenderer.on('transcribe:progress', (_event, data) => callback(data));
    return () => ipcRenderer.removeAllListeners('transcribe:progress');
  },

  getAppInfo: () => ipcRenderer.invoke('app:getInfo'),
  getMemoryUsage: () => ipcRenderer.invoke('app:getMemoryUsage'),
  trackEvent: (eventName: string, properties?: Record<string, string | number | boolean>) =>
    ipcRenderer.invoke('analytics:track', eventName, properties),

  openExternal: (url: string) => ipcRenderer.invoke('shell:openExternal', url),
  showItemInFolder: (filePath: string) => ipcRenderer.invoke('shell:showItemInFolder', filePath),

  onMenuOpenFile: (callback: () => void) => {
    ipcRenderer.on('menu:openFile', () => callback());
    return () => ipcRenderer.removeAllListeners('menu:openFile');
  },
  onMenuSaveFile: (callback: () => void) => {
    ipcRenderer.on('menu:saveFile', () => callback());
    return () => ipcRenderer.removeAllListeners('menu:saveFile');
  },
  onMenuCopyTranscription: (callback: () => void) => {
    ipcRenderer.on('menu:copyTranscription', () => callback());
    return () => ipcRenderer.removeAllListeners('menu:copyTranscription');
  },
  onMenuStartTranscription: (callback: () => void) => {
    ipcRenderer.on('menu:startTranscription', () => callback());
    return () => ipcRenderer.removeAllListeners('menu:startTranscription');
  },
  onMenuCancelTranscription: (callback: () => void) => {
    ipcRenderer.on('menu:cancelTranscription', () => callback());
    return () => ipcRenderer.removeAllListeners('menu:cancelTranscription');
  },
  onMenuToggleHistory: (callback: () => void) => {
    ipcRenderer.on('menu:toggleHistory', () => callback());
    return () => ipcRenderer.removeAllListeners('menu:toggleHistory');
  },

  // Live system audio capture
  startLiveCapture: (options: LiveCaptureOptions) => ipcRenderer.invoke('live:start', options),
  stopLiveCapture: () => ipcRenderer.invoke('live:stop'),
  getLiveCaptureStatus: () => ipcRenderer.invoke('live:status') as Promise<LiveCaptureStatus>,
  onLiveChunk: (callback: (chunk: LiveTranscriptChunk) => void) => {
    ipcRenderer.on('live:chunk', (_event, chunk) => callback(chunk));
    return () => ipcRenderer.removeAllListeners('live:chunk');
  },
  onLiveStatus: (callback: (status: LiveCaptureStatus) => void) => {
    ipcRenderer.on('live:status', (_event, status) => callback(status));
    return () => ipcRenderer.removeAllListeners('live:status');
  },
  onLiveError: (callback: (error: string) => void) => {
    ipcRenderer.on('live:error', (_event, error) => callback(error));
    return () => ipcRenderer.removeAllListeners('live:error');
  },
  onLiveTranslation: (callback: (data: { index: number; translation: string }) => void) => {
    ipcRenderer.on('live:translation', (_event, data) => callback(data));
    return () => ipcRenderer.removeAllListeners('live:translation');
  },
  onLivePartial: (callback: (text: string) => void) => {
    ipcRenderer.on('live:partial', (_event, text) => callback(text));
    return () => ipcRenderer.removeAllListeners('live:partial');
  },
  onLivePartialTranslation: (callback: (translation: string) => void) => {
    ipcRenderer.on('live:partial-translation', (_event, t) => callback(t));
    return () => ipcRenderer.removeAllListeners('live:partial-translation');
  },

  // Translation backend
  setTranslationBackend: (backend: 'xenova' | 'apple') =>
    ipcRenderer.invoke('translation:setBackend', backend),
  getTranslationBackend: () =>
    ipcRenderer.invoke('translation:getBackend') as Promise<'xenova' | 'apple'>,

  checkForUpdates: () => ipcRenderer.invoke('update:check'),
  downloadUpdate: () => ipcRenderer.invoke('update:download'),
  installUpdate: () => ipcRenderer.invoke('update:install'),
  onUpdateStatus: (callback: (data: UpdateStatus) => void) => {
    ipcRenderer.on('update:status', (_event, data) => callback(data));
    return () => ipcRenderer.removeAllListeners('update:status');
  },
});
