import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, createEvent } from '@testing-library/react';
import { FileDropZone } from '@/features/transcription';
import { overrideElectronAPI } from '@/test/utils';
import { createMockFile } from '@/test/fixtures';

describe('FileDropZone', () => {
  const onFilesSelect = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render dropzone with batch text', () => {
    render(<FileDropZone onFilesSelect={onFilesSelect} disabled={false} />);

    expect(screen.getByText(/Drop audio\/video files here/i)).toBeInTheDocument();
    expect(screen.getByText(/multiple files/i)).toBeInTheDocument();
  });

  it('should be clickable and open multiple files dialog', async () => {
    overrideElectronAPI({
      openMultipleFiles: vi.fn().mockResolvedValue(['/path/to/test1.mp3', '/path/to/test2.mp3']),
      getFileInfo: vi.fn().mockImplementation(async (path) => ({
        name: path.split('/').pop(),
        path,
        size: 1024,
      })),
    });

    render(<FileDropZone onFilesSelect={onFilesSelect} disabled={false} />);

    const dropzone = screen.getByRole('button');
    fireEvent.click(dropzone);

    await waitFor(() => {
      expect(window.electronAPI?.openMultipleFiles).toHaveBeenCalled();
      expect(onFilesSelect).toHaveBeenCalledTimes(1);
    });

    const calledFiles = onFilesSelect.mock.calls[0]?.[0] ?? [];
    expect(calledFiles).toHaveLength(2);
    expect(calledFiles[0].name).toBe('test1.mp3');
    expect(calledFiles[1].name).toBe('test2.mp3');
  });

  it('should handle file drop with valid files', async () => {
    overrideElectronAPI({
      getPathForFile: vi.fn().mockReturnValue('/path/to/test.mp3'),
      getFileInfo: vi.fn().mockResolvedValue({
        name: 'test.mp3',
        path: '/path/to/test.mp3',
        size: 1024,
      }),
    });

    render(<FileDropZone onFilesSelect={onFilesSelect} disabled={false} />);

    const dropzone = screen.getByRole('button');
    const file = createMockFile({ name: 'test.mp3' });

    fireEvent.drop(dropzone, {
      dataTransfer: {
        files: [file],
      },
    });

    await waitFor(() => {
      expect(onFilesSelect).toHaveBeenCalledWith([
        expect.objectContaining({
          name: 'test.mp3',
          path: '/path/to/test.mp3',
        }),
      ]);
    });
  });

  it('should filter out invalid files', async () => {
    overrideElectronAPI({
      openMultipleFiles: vi.fn().mockResolvedValue(['/path/to/test.txt']),
      getFileInfo: vi.fn().mockResolvedValue(null),
    });

    render(<FileDropZone onFilesSelect={onFilesSelect} disabled={false} />);

    const dropzone = screen.getByRole('button');
    fireEvent.click(dropzone);

    await waitFor(() => {
      expect(window.electronAPI?.openMultipleFiles).toHaveBeenCalled();
    });

    expect(onFilesSelect).not.toHaveBeenCalled();
  });

  it('should not trigger action when disabled', async () => {
    render(<FileDropZone onFilesSelect={onFilesSelect} disabled={true} />);

    const dropzone = screen.getByRole('button');
    fireEvent.click(dropzone);

    expect(window.electronAPI?.openMultipleFiles).not.toHaveBeenCalled();
  });

  it('should prevent default on drag over', () => {
    render(<FileDropZone onFilesSelect={onFilesSelect} disabled={false} />);

    const dropzone = screen.getByRole('button');
    const event = createEvent.dragOver(dropzone);
    const preventDefaultSpy = vi.spyOn(event, 'preventDefault');
    fireEvent(dropzone, event);

    expect(preventDefaultSpy).toHaveBeenCalled();
  });

  it('should open file dialog on Enter key', async () => {
    overrideElectronAPI({
      openMultipleFiles: vi.fn().mockResolvedValue(['/path/to/test1.mp3']),
      getFileInfo: vi.fn().mockResolvedValue({
        name: 'test1.mp3',
        path: '/path/to/test1.mp3',
        size: 1024,
      }),
    });

    render(<FileDropZone onFilesSelect={onFilesSelect} disabled={false} />);
    const dropzone = screen.getByRole('button');

    fireEvent.keyDown(dropzone, { key: 'Enter' });

    await waitFor(() => {
      expect(window.electronAPI?.openMultipleFiles).toHaveBeenCalled();
      expect(onFilesSelect).toHaveBeenCalledTimes(1);
    });
  });

  it('should ignore non-activation keys', () => {
    render(<FileDropZone onFilesSelect={onFilesSelect} disabled={false} />);
    const dropzone = screen.getByRole('button');

    fireEvent.keyDown(dropzone, { key: 'ArrowDown' });

    expect(window.electronAPI?.openMultipleFiles).not.toHaveBeenCalled();
  });

  it('should show queue count badge', () => {
    render(<FileDropZone onFilesSelect={onFilesSelect} disabled={false} queueCount={3} />);

    expect(screen.getByText('3 files in queue')).toBeInTheDocument();
  });

  it('should show duplicate files skipped badge', () => {
    render(
      <FileDropZone onFilesSelect={onFilesSelect} disabled={false} duplicateFilesSkipped={2} />
    );

    expect(screen.getByText('Skipped 2 duplicate files')).toBeInTheDocument();
  });

  it('should handle multiple files drop', async () => {
    overrideElectronAPI({
      getPathForFile: vi.fn((file) => `/path/to/${file.name}`),
      getFileInfo: vi.fn(async (path) => ({
        name: path.split('/').pop(),
        path,
        size: 1024,
      })),
    });

    render(<FileDropZone onFilesSelect={onFilesSelect} disabled={false} />);

    const dropzone = screen.getByRole('button');
    const file1 = createMockFile({ name: 'test1.mp3' });
    const file2 = createMockFile({ name: 'test2.wav' });

    fireEvent.drop(dropzone, {
      dataTransfer: {
        files: [file1, file2],
      },
    });

    await waitFor(() => {
      expect(onFilesSelect).toHaveBeenCalledWith([
        expect.objectContaining({ name: 'test1.mp3' }),
        expect.objectContaining({ name: 'test2.wav' }),
      ]);
    });
  });
});
