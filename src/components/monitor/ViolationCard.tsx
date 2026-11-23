import { evidenceApi } from '../../api/evidence.api';
import { EXPIRED_THUMB_SVG, VIOLATION_STATUS_CONFIG } from '../../config/constants';
import { formatConfidence, formatShortRelativeTime } from '../../utils/formatters';
import type { Violation } from '../../types/violation.types';

interface ViolationCardProps {
  violation: Violation;
  relativeNowMs: number;
  onOpenEvidence: (violation: Violation, tab: 'video' | 'snapshot') => void;
  onReview: (id: string, status: 'CONFIRMED' | 'DISMISSED') => void;
}

export function ViolationCard({
  violation: v,
  relativeNowMs,
  onOpenEvidence,
  onReview,
}: ViolationCardProps) {
  const snapshotUrl = evidenceApi.resolveMediaUrl(v.snapshotUrl);
  const statusCfg = VIOLATION_STATUS_CONFIG[v.status];

  return (
    <article className="violation-card">
      <img
        className="violation-thumb"
        src={snapshotUrl || EXPIRED_THUMB_SVG}
        alt={`Violation #${v.trackId}`}
        title="Click to inspect violation evidence"
        onError={(e) => {
          if (e.currentTarget.dataset.expired === '1') return;
          e.currentTarget.dataset.expired = '1';
          e.currentTarget.src = EXPIRED_THUMB_SVG;
        }}
        onClick={() => onOpenEvidence(v, 'video')}
      />
      <div className="violation-info">
        {/* Row 1: Vehicle + ID */}
        <div className="violation-title">
          <span style={{ textTransform: 'capitalize' }}>{v.vehicleClass}</span>
          <span>#{v.trackId}</span>
        </div>

        {/* Row 2: Camera + Reviewing State */}
        <div className="violation-badges-row">
          <span className="violation-attr-cam">{v.cameraId}</span>
          <span className="violation-attr-sep" aria-hidden="true">
            •
          </span>
          <span className="violation-attr-status" style={{ color: statusCfg.color }}>
            {statusCfg.label}
          </span>
        </div>

        {/* Row 3: Info (Confidence + relative time) */}
        <div className="violation-meta">
          Confidence: {formatConfidence(v.confidence)} •{' '}
          {formatShortRelativeTime(v.createdAt, relativeNowMs)}
        </div>

        {/* Row 4: Confirm and Dismiss */}
        {v.status === 'PENDING_REVIEW' && (
          <div className="violation-actions">
            <button
              type="button"
              className="btn btn-compact btn-danger"
              onClick={() => onReview(v.id, 'CONFIRMED')}
            >
              Confirm
            </button>
            <button
              type="button"
              className="btn btn-compact"
              onClick={() => onReview(v.id, 'DISMISSED')}
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Row 5: Stream Video and Snapshot */}
        <div className="violation-actions">
          <button
            type="button"
            className="btn btn-compact btn-purple"
            onClick={() => onOpenEvidence(v, 'video')}
          >
            Stream Video
          </button>
          <button
            type="button"
            className="btn btn-compact"
            onClick={() => onOpenEvidence(v, 'snapshot')}
          >
            Snapshot
          </button>
        </div>
      </div>
    </article>
  );
}
