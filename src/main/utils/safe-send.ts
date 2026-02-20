import type { BrowserWindow } from 'electron';

function isObjectDestroyedError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  return error.message.toLowerCase().includes('object has been destroyed');
}

export function safeSend(
  mainWindow: BrowserWindow | null,
  channel: string,
  ...args: unknown[]
): void {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }

  const contents = mainWindow.webContents;
  if (!contents || contents.isDestroyed()) {
    return;
  }

  try {
    contents.send(channel, ...args);
  } catch (error) {
    if (isObjectDestroyedError(error)) {
      return;
    }
    throw error;
  }
}
