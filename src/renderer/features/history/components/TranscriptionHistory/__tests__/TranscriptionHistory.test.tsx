import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TranscriptionHistory } from '@/features/history';
import { createMockHistoryItem } from '@/test/fixtures';

describe('TranscriptionHistory component', () => {
  it('renders empty state when no history', () => {
    const onClear = vi.fn();
    const onClose = vi.fn();
    const onSelect = vi.fn();
    const onDelete = vi.fn();

    render(
      <TranscriptionHistory
        history={[]}
        onClear={onClear}
        onClose={onClose}
        onSelect={onSelect}
        onDelete={onDelete}
      />
    );

    expect(screen.getByText(/No transcriptions yet/i)).toBeInTheDocument();
    expect(screen.queryByText(/Clear All/i)).not.toBeInTheDocument();
  });

  it('renders history items and calls onSelect on click', () => {
    const mockHistoryItem = createMockHistoryItem();
    const onClear = vi.fn();
    const onClose = vi.fn();
    const onSelect = vi.fn();
    const onDelete = vi.fn();

    render(
      <TranscriptionHistory
        history={[mockHistoryItem]}
        onClear={onClear}
        onClose={onClose}
        onSelect={onSelect}
        onDelete={onDelete}
      />
    );

    expect(screen.getByText(/Transcription History/i)).toBeInTheDocument();
    expect(screen.getByText('test.mp3')).toBeInTheDocument();

    const item = screen.getByText('test.mp3').closest('.history-item') as HTMLElement;
    fireEvent.click(item);

    expect(onSelect).toHaveBeenCalledWith(mockHistoryItem);
  });

  it('filters history items by transcript content and file name', () => {
    const onClear = vi.fn();
    const onClose = vi.fn();
    const onSelect = vi.fn();
    const onDelete = vi.fn();
    const firstItem = createMockHistoryItem({
      id: 'history-1',
      fileName: 'finance-report.mp3',
      fullText: 'Quarterly earnings increased by twelve percent',
      preview: 'Quarterly earnings increased...',
    });
    const secondItem = createMockHistoryItem({
      id: 'history-2',
      fileName: 'meeting-notes.mp3',
      fullText: 'Team retrospective and sprint planning notes',
      preview: 'Team retrospective...',
    });

    render(
      <TranscriptionHistory
        history={[firstItem, secondItem]}
        onClear={onClear}
        onClose={onClose}
        onSelect={onSelect}
        onDelete={onDelete}
      />
    );

    const searchInput = screen.getByLabelText('Search history');
    fireEvent.change(searchInput, { target: { value: 'earnings' } });

    expect(screen.getByText('finance-report.mp3')).toBeInTheDocument();
    expect(screen.queryByText('meeting-notes.mp3')).not.toBeInTheDocument();

    fireEvent.change(searchInput, { target: { value: 'meeting-notes' } });

    expect(screen.getByText('meeting-notes.mp3')).toBeInTheDocument();
    expect(screen.queryByText('finance-report.mp3')).not.toBeInTheDocument();
  });

  it('shows empty search state when there are no matching history items', () => {
    const onClear = vi.fn();
    const onClose = vi.fn();
    const onSelect = vi.fn();
    const onDelete = vi.fn();
    const historyItem = createMockHistoryItem({
      id: 'history-1',
      fullText: 'The quick brown fox',
      preview: 'The quick brown fox...',
    });

    render(
      <TranscriptionHistory
        history={[historyItem]}
        onClear={onClear}
        onClose={onClose}
        onSelect={onSelect}
        onDelete={onDelete}
      />
    );

    fireEvent.change(screen.getByLabelText('Search history'), { target: { value: 'not found' } });

    expect(screen.getByText('No matches found')).toBeInTheDocument();
    expect(screen.getByText('0 results')).toBeInTheDocument();
  });

  it('clears the search query when clear search button is clicked', () => {
    const onClear = vi.fn();
    const onClose = vi.fn();
    const onSelect = vi.fn();
    const onDelete = vi.fn();
    const historyItem = createMockHistoryItem({
      id: 'history-1',
      fullText: 'alpha beta gamma',
      preview: 'alpha beta gamma',
    });

    render(
      <TranscriptionHistory
        history={[historyItem]}
        onClear={onClear}
        onClose={onClose}
        onSelect={onSelect}
        onDelete={onDelete}
      />
    );

    const searchInput = screen.getByLabelText('Search history') as HTMLInputElement;
    fireEvent.change(searchInput, { target: { value: 'alpha' } });
    expect(searchInput.value).toBe('alpha');

    fireEvent.click(screen.getByLabelText('Clear history search'));
    expect(searchInput.value).toBe('');
  });

  it('focuses search input with keyboard shortcut', () => {
    const onClear = vi.fn();
    const onClose = vi.fn();
    const onSelect = vi.fn();
    const onDelete = vi.fn();
    const historyItem = createMockHistoryItem();

    render(
      <TranscriptionHistory
        history={[historyItem]}
        onClear={onClear}
        onClose={onClose}
        onSelect={onSelect}
        onDelete={onDelete}
      />
    );

    fireEvent.keyDown(document, { key: 'f', ctrlKey: true });
    expect(screen.getByLabelText('Search history')).toHaveFocus();
  });

  it('calls onSelect on Enter key press', () => {
    const mockHistoryItem = createMockHistoryItem();
    const onClear = vi.fn();
    const onClose = vi.fn();
    const onSelect = vi.fn();
    const onDelete = vi.fn();

    render(
      <TranscriptionHistory
        history={[mockHistoryItem]}
        onClear={onClear}
        onClose={onClose}
        onSelect={onSelect}
        onDelete={onDelete}
      />
    );

    const item = screen.getByText('test.mp3').closest('.history-item') as HTMLElement;
    item.focus();
    fireEvent.keyDown(item, { key: 'Enter', code: 'Enter' });

    expect(onSelect).toHaveBeenCalledWith(mockHistoryItem);
  });

  it('shows clear button only when history is not empty and handles actions', () => {
    const mockHistoryItem = createMockHistoryItem();
    const onClear = vi.fn();
    const onClose = vi.fn();
    const onSelect = vi.fn();
    const onDelete = vi.fn();

    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);

    render(
      <TranscriptionHistory
        history={[mockHistoryItem]}
        onClear={onClear}
        onClose={onClose}
        onSelect={onSelect}
        onDelete={onDelete}
      />
    );

    const clearButton = screen.getByText(/Clear All/i);
    fireEvent.click(clearButton);
    expect(confirmSpy).toHaveBeenCalledWith(
      'Are you sure you want to clear all transcription history?'
    );
    expect(onClear).toHaveBeenCalled();

    const closeButton = screen.getByText(/Close/i);
    fireEvent.click(closeButton);
    expect(onClose).toHaveBeenCalled();

    confirmSpy.mockRestore();
  });

  it('calls onDelete when delete button is clicked without selecting item', () => {
    const mockHistoryItem = createMockHistoryItem();
    const onClear = vi.fn();
    const onClose = vi.fn();
    const onSelect = vi.fn();
    const onDelete = vi.fn();

    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);

    render(
      <TranscriptionHistory
        history={[mockHistoryItem]}
        onClear={onClear}
        onClose={onClose}
        onSelect={onSelect}
        onDelete={onDelete}
      />
    );

    const deleteButton = screen.getByLabelText(`Delete ${mockHistoryItem.fileName}`);
    fireEvent.click(deleteButton);

    expect(confirmSpy).toHaveBeenCalledWith(
      `Are you sure you want to delete the transcription for "${mockHistoryItem.fileName}"?`
    );
    expect(onDelete).toHaveBeenCalledWith(mockHistoryItem.id);
    expect(onSelect).not.toHaveBeenCalled();

    confirmSpy.mockRestore();
  });

  it('does not call onDelete when delete confirmation is cancelled', () => {
    const mockHistoryItem = createMockHistoryItem();
    const onClear = vi.fn();
    const onClose = vi.fn();
    const onSelect = vi.fn();
    const onDelete = vi.fn();

    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);

    render(
      <TranscriptionHistory
        history={[mockHistoryItem]}
        onClear={onClear}
        onClose={onClose}
        onSelect={onSelect}
        onDelete={onDelete}
      />
    );

    const deleteButton = screen.getByLabelText(`Delete ${mockHistoryItem.fileName}`);
    fireEvent.click(deleteButton);

    expect(confirmSpy).toHaveBeenCalled();
    expect(onDelete).not.toHaveBeenCalled();

    confirmSpy.mockRestore();
  });

  it('does not call onClear when clear all confirmation is cancelled', () => {
    const mockHistoryItem = createMockHistoryItem();
    const onClear = vi.fn();
    const onClose = vi.fn();
    const onSelect = vi.fn();
    const onDelete = vi.fn();

    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);

    render(
      <TranscriptionHistory
        history={[mockHistoryItem]}
        onClear={onClear}
        onClose={onClose}
        onSelect={onSelect}
        onDelete={onDelete}
      />
    );

    const clearButton = screen.getByText(/Clear All/i);
    fireEvent.click(clearButton);

    expect(confirmSpy).toHaveBeenCalledWith(
      'Are you sure you want to clear all transcription history?'
    );
    expect(onClear).not.toHaveBeenCalled();

    confirmSpy.mockRestore();
  });

  it('does not call onSelect on non-Enter key press', () => {
    const mockHistoryItem = createMockHistoryItem();
    const onClear = vi.fn();
    const onClose = vi.fn();
    const onSelect = vi.fn();
    const onDelete = vi.fn();

    render(
      <TranscriptionHistory
        history={[mockHistoryItem]}
        onClear={onClear}
        onClose={onClose}
        onSelect={onSelect}
        onDelete={onDelete}
      />
    );

    const item = screen.getByText('test.mp3').closest('.history-item') as HTMLElement;
    item.focus();
    fireEvent.keyDown(item, { key: 'Space', code: 'Space' });

    expect(onSelect).not.toHaveBeenCalled();
  });

  it('displays all item metadata correctly', () => {
    const mockHistoryItem = createMockHistoryItem({
      model: 'base',
      language: 'en',
      format: 'vtt',
      duration: 120,
    });
    const onClear = vi.fn();
    const onClose = vi.fn();
    const onSelect = vi.fn();
    const onDelete = vi.fn();

    render(
      <TranscriptionHistory
        history={[mockHistoryItem]}
        onClear={onClear}
        onClose={onClose}
        onSelect={onSelect}
        onDelete={onDelete}
      />
    );

    expect(screen.getByText('base')).toBeInTheDocument();
    expect(screen.getByText('English')).toBeInTheDocument();
    expect(screen.getByText('.vtt')).toBeInTheDocument();
    expect(screen.getByText('2m 0s')).toBeInTheDocument();
  });
});
