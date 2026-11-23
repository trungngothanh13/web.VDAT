import { useEffect, useRef, useState } from 'react';
import { evidenceApi } from '../../api/evidence.api';
import { useDialogLightDismiss } from '../../hooks/useDialogLightDismiss';
import { ExpiredMediaState } from '../common/ExpiredMediaState';
import type { Violation } from '../../types/violation.types';

export interface ActiveEvidenceState {
  violation: Violation;
  mediaTab: 'video' | 'snapshot';
}

interface EvidenceDialogProps {
  evidence: ActiveEvidenceState | null;
  onTabChange: (tab: 'video' | 'snapshot') => void;
  onClose: () => void;
  onReview: (id: string, status: 'CONFIRMED' | 'DISMISSED') => void;
}

export function EvidenceDialog({
  evidence,
  onTabChange,
  onClose,
  onReview,
}: EvidenceDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  useDialogLightDismiss(dialogRef);

  const [videoMediaExpired, setVideoMediaExpired] = useState(false);
  const [snapshotMediaExpired, setSnapshotMediaExpired] = useState(false);

  const violation = evidence?.violation ?? null;
  const violationId = violation?.id ?? null;

  useEffect(() => {
    setVideoMediaExpired(false);
    setSnapshotMediaExpired(false);
  }, [violationId]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (evidence && dialog && !dialog.open) {
      dialog.showModal();
    }
  }, [evidence]);

  const activeSnapshotUrl = violation ? evidenceApi.resolveMediaUrl(violation.snapshotUrl) : '';
  const activeStreamUrl = violation
    ? evidenceApi.resolveMediaUrl(
        violation.evidenceClipUrl ||
          `/api/evidence/stream/${violation.cameraId}/violation_${violation.cameraId}_id${violation.trackId}_f${violation.frameNumber}.mp4`
      )
    : '';
  const activeDownloadUrl = activeStreamUrl
    ? `${activeStreamUrl}${activeStreamUrl.includes('?') ? '&' : '?'}download=1`
    : '';

  return (
    <dialog
      ref={dialogRef}
      {...({ closedby: 'any' } as any)}
      className="app-dialog"
      aria-labelledby="evidence-dialog-title"
      onClose={onClose}
    >
      <div className="dialog-header">
        <h1 id="evidence-dialog-title" className="dialog-title">
          {violation
            ? `Violation Evidence — Track #${violation.trackId} (${violation.vehicleClass}) • Frame ${violation.frameNumber}`
            : 'Violation Evidence'}
        </h1>
        <form method="dialog">
          <button type="submit" className="btn btn-compact">
            Close
          </button>
        </form>
      </div>

      {violation && evidence && (
        <div className="dialog-body">
          <div
            className="toolbar-actions"
            style={{ justifyContent: 'space-between', width: '100%' }}
          >
            <div className="toolbar-actions">
              <button
                type="button"
                className={`btn btn-compact ${evidence.mediaTab === 'video' ? 'btn-active' : ''}`}
                onClick={() => onTabChange('video')}
              >
                Video Evidence Stream
              </button>
              <button
                type="button"
                className={`btn btn-compact ${
                  evidence.mediaTab === 'snapshot' ? 'btn-active' : ''
                }`}
                onClick={() => onTabChange('snapshot')}
              >
                Annotated Snapshot
              </button>
            </div>

            <div className="toolbar-actions">
              {violation.status === 'PENDING_REVIEW' && (
                <>
                  <button
                    type="button"
                    className="btn btn-compact btn-danger"
                    onClick={() => onReview(violation.id, 'CONFIRMED')}
                  >
                    Confirm Violation
                  </button>
                  <button
                    type="button"
                    className="btn btn-compact"
                    onClick={() => onReview(violation.id, 'DISMISSED')}
                  >
                    Dismiss
                  </button>
                </>
              )}
              {activeDownloadUrl && !videoMediaExpired && (
                <a href={activeDownloadUrl} download className="btn btn-compact">
                  Download MP4
                </a>
              )}
              {activeSnapshotUrl && !snapshotMediaExpired && (
                <a href={activeSnapshotUrl} download className="btn btn-compact">
                  Download JPG
                </a>
              )}
            </div>
          </div>

          <div className="evidence-player-frame">
            {evidence.mediaTab === 'video' ? (
              !activeStreamUrl || videoMediaExpired ? (
                <ExpiredMediaState
                  title="Evidence Clip Expired"
                  message="This temporary violation video clip has expired or is no longer available on the server."
                />
              ) : (
                <video
                  key={activeStreamUrl}
                  src={activeStreamUrl}
                  poster={!snapshotMediaExpired && activeSnapshotUrl ? activeSnapshotUrl : undefined}
                  controls
                  autoPlay
                  playsInline
                  preload="metadata"
                  onError={() => setVideoMediaExpired(true)}
                />
              )
            ) : !activeSnapshotUrl || snapshotMediaExpired ? (
              <ExpiredMediaState
                title="Evidence Snapshot Expired"
                message="This temporary snapshot image has expired or was purged from storage."
              />
            ) : (
              <img
                src={activeSnapshotUrl}
                alt={`Snapshot for Violation #${violation.trackId}`}
                onError={() => setSnapshotMediaExpired(true)}
              />
            )}
          </div>
        </div>
      )}
    </dialog>
  );
}
