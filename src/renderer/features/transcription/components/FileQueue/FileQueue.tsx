import React from 'react';
import { CheckCircle, Loader, Clock, XCircle, Slash, X, Trash2, RotateCcw } from 'lucide-react';
import { Button } from '../../../../components/ui';
import { formatFileSize } from '../../../../utils';
import type { QueueItem, QueueItemStatus } from '../../../../types';
import './FileQueue.css';

export interface FileQueueProps {
  queue: QueueItem[];
  onRemove: (id: string) => void;
  onClearCompleted: () => void;
  onRetryFailed: () => void;
  onSelectItem?: (id: string) => void;
  selectedItemId?: string | null;
  estimatedTimeRemainingSec?: number | null;
  disabled?: boolean;
}

function getStatusIcon(status: QueueItemStatus): React.ReactNode {
  switch (status) {
    case 'completed':
      return <CheckCircle size={16} className="status-icon completed" />;
    case 'processing':
      return <Loader size={16} className="status-icon processing spin" />;
    case 'pending':
      return <Clock size={16} className="status-icon pending" />;
    case 'error':
      return <XCircle size={16} className="status-icon error" />;
    case 'cancelled':
      return <Slash size={16} className="status-icon cancelled" />;
    default:
      return null;
  }
}

function formatEstimatedTime(seconds: number): string {
  const totalSeconds = Math.max(0, Math.round(seconds));
  if (totalSeconds < 60) {
    return `${totalSeconds}s`;
  }

  if (totalSeconds < 3600) {
    const minutes = Math.floor(totalSeconds / 60);
    const remainingSeconds = totalSeconds % 60;
    return remainingSeconds > 0 ? `${minutes}m ${remainingSeconds}s` : `${minutes}m`;
  }

  const hours = Math.floor(totalSeconds / 3600);
  const remainingMinutes = Math.floor((totalSeconds % 3600) / 60);
  return remainingMinutes > 0 ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
}

function FileQueue({
  queue,
  onRemove,
  onClearCompleted,
  onRetryFailed,
  onSelectItem,
  selectedItemId,
  estimatedTimeRemainingSec = null,
  disabled = false,
}: FileQueueProps): React.JSX.Element | null {
  if (queue.length === 0) {
    return null;
  }

  const completedCount = queue.filter((item) => item.status === 'completed').length;
  const processingCount = queue.filter((item) => item.status === 'processing').length;
  const pendingCount = queue.filter((item) => item.status === 'pending').length;
  const errorCount = queue.filter((item) => item.status === 'error').length;
  const cancelledCount = queue.filter((item) => item.status === 'cancelled').length;
  const retryCount = errorCount + cancelledCount;
  const hasRetryItems = retryCount > 0;
  const hasCompletedItems = completedCount > 0 || queue.some((item) => item.status === 'cancelled');

  const handleItemClick = (id: string): void => {
    onSelectItem?.(id);
  };

  const handleRemoveClick = (e: React.MouseEvent, id: string, isProcessing: boolean): void => {
    e.stopPropagation();
    if (disabled || isProcessing) return;
    onRemove(id);
  };

  return (
    <div className="file-queue">
      <div className="file-queue-header">
        <span className="file-queue-title">FILES ({queue.length})</span>
        <div className="file-queue-header-actions">
          {hasRetryItems && (
            <Button
              variant="ghost"
              size="sm"
              icon={<RotateCcw size={14} />}
              onClick={onRetryFailed}
              disabled={disabled}
              title="Retry failed and cancelled items"
            >
              Retry Failed
            </Button>
          )}
          {hasCompletedItems && (
            <Button
              variant="ghost"
              size="sm"
              icon={<Trash2 size={14} />}
              onClick={onClearCompleted}
              disabled={disabled}
              title="Clear completed"
            >
              Clear
            </Button>
          )}
        </div>
      </div>

      <div className="file-queue-list">
        {queue.map((item) => (
          <div
            key={item.id}
            className={`file-queue-item ${item.status} ${selectedItemId === item.id ? 'selected' : ''}`}
            onClick={() => handleItemClick(item.id)}
            role="button"
            tabIndex={0}
            aria-label={`Select ${item.file.name} to view transcription`}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                handleItemClick(item.id);
              }
            }}
          >
            <div className="file-queue-item-status">{getStatusIcon(item.status)}</div>
            <div className="file-queue-item-content">
              <span className="file-queue-item-name">{item.file.name}</span>
              {item.status === 'processing' && (
                <div className="file-queue-item-progress">
                  <div
                    className="file-queue-item-progress-bar"
                    style={{ width: `${item.progress.percent}%` }}
                  />
                </div>
              )}
              {item.status === 'error' && item.error && (
                <span className="file-queue-item-error">{item.error}</span>
              )}
            </div>
            <div className="file-queue-item-meta">
              {item.status === 'processing' && (
                <span className="file-queue-item-percent">{item.progress.percent}%</span>
              )}
              {item.file.size && (
                <span className="file-queue-item-size">{formatFileSize(item.file.size)}</span>
              )}
            </div>
            <Button
              variant="ghost"
              size="sm"
              icon={<X size={14} />}
              iconOnly
              onClick={(e) => handleRemoveClick(e, item.id, item.status === 'processing')}
              disabled={disabled || item.status === 'processing'}
              title="Remove from queue"
              aria-label={`Remove ${item.file.name} from queue`}
              className="file-queue-item-remove"
            />
          </div>
        ))}
      </div>

      <div className="file-queue-summary">
        {completedCount > 0 && <span>{completedCount} completed</span>}
        {processingCount > 0 && <span>{processingCount} processing</span>}
        {processingCount > 0 && (
          <span className="eta">
            ETA{' '}
            {typeof estimatedTimeRemainingSec === 'number'
              ? formatEstimatedTime(estimatedTimeRemainingSec)
              : 'calculating...'}
          </span>
        )}
        {pendingCount > 0 && <span>{pendingCount} pending</span>}
        {errorCount > 0 && <span className="error">{errorCount} failed</span>}
        {completedCount > 0 && !processingCount && (
          <span className="hint">Click a file to view its transcription</span>
        )}
      </div>
    </div>
  );
}

export { FileQueue };
