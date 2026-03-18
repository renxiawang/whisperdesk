import React, { useState, useCallback } from 'react';
import { AppProvider } from './contexts';
import { AppHeader, LeftPanel, RightPanel } from './components';
import { ErrorBoundary } from './components/ui';
import { UpdateNotification } from './features/auto-update';
import { LiveTranscriptionPanel } from './features/live-transcription';
import { useAppTranscription } from './contexts';
import './App.css';

export type AppMode = 'file' | 'live';

function AppContent({ mode }: { mode: AppMode }): React.JSX.Element {
  const { settings, modelDownloaded } = useAppTranscription();

  if (mode === 'live') {
    return (
      <main className="app-main app-main--live">
        <LiveTranscriptionPanel settings={settings} modelDownloaded={modelDownloaded} />
      </main>
    );
  }

  return (
    <main className="app-main">
      <LeftPanel />
      <RightPanel />
    </main>
  );
}

function App(): React.JSX.Element {
  const [mode, setMode] = useState<AppMode>('file');

  const onModeChange = useCallback((m: AppMode) => setMode(m), []);

  return (
    <ErrorBoundary>
      <AppProvider>
        <div className="app">
          <AppHeader mode={mode} onModeChange={onModeChange} />
          <AppContent mode={mode} />
          <UpdateNotification />
        </div>
      </AppProvider>
    </ErrorBoundary>
  );
}

export { App };
