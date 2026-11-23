import { useEffect, useState } from 'react';
import { VIOLATION_STATUS_CONFIG } from '../../config/constants';
import { exportViolationsToCsv } from '../../utils/export';
import { ViolationCard } from './ViolationCard';
import type { Camera } from '../../types/camera.types';
import type { Violation, ViolationStatus } from '../../types/violation.types';

interface ViolationEvidencePanelProps {
  violations: Violation[];
  cameraSlots: Camera[];
  statusFilter: ViolationStatus | undefined;
  onStatusFilterChange: (next: ViolationStatus | undefined) => void;
  cameraFilter: string | undefined;
  onCameraFilterChange: (next: string | undefined) => void;
  onOpenEvidence: (violation: Violation, tab: 'video' | 'snapshot') => void;
  onReview: (id: string, status: 'CONFIRMED' | 'DISMISSED') => void;
}

export function ViolationEvidencePanel({
  violations,
  cameraSlots,
  statusFilter,
  onStatusFilterChange,
  cameraFilter,
  onCameraFilterChange,
  onOpenEvidence,
  onReview,
}: ViolationEvidencePanelProps) {
  const [relativeNowMs, setRelativeNowMs] = useState(() => Date.now());

  // Keep "? mins ago" relative labels fresh automatically without re-rendering parent workspace
  useEffect(() => {
    const timer = setInterval(() => setRelativeNowMs(Date.now()), 30000);
    return () => clearInterval(timer);
  }, []);

  return (
    <aside className="card card-sidebar" aria-labelledby="proofs-title">
      <div className="card-header">
        <span id="proofs-title">Violation Evidence ({violations.length})</span>
        <div className="toolbar-actions">
          <button
            type="button"
            className="btn btn-compact"
            onClick={() => exportViolationsToCsv(violations)}
            disabled={violations.length === 0}
          >
            Export CSV
          </button>
        </div>
      </div>

      <div
        className="filter-bar"
        role="group"
        aria-label="Filter violations by status and camera"
        style={{ justifyContent: 'space-between', alignItems: 'center' }}
      >
        <div className="toolbar-actions">
          <label
            htmlFor="violation-status-filter"
            style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}
          >
            Status:
          </label>
          <select
            id="violation-status-filter"
            className="btn btn-compact"
            value={statusFilter ?? 'ALL'}
            onChange={(e) =>
              onStatusFilterChange(
                e.target.value === 'ALL' ? undefined : (e.target.value as ViolationStatus)
              )
            }
          >
            <option value="ALL">All</option>
            <option value="PENDING_REVIEW">{VIOLATION_STATUS_CONFIG.PENDING_REVIEW.label}</option>
            <option value="CONFIRMED">{VIOLATION_STATUS_CONFIG.CONFIRMED.label}</option>
            <option value="DISMISSED">{VIOLATION_STATUS_CONFIG.DISMISSED.label}</option>
          </select>
        </div>

        <div className="toolbar-actions">
          <label
            htmlFor="violation-camera-filter"
            style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}
          >
            Camera:
          </label>
          <select
            id="violation-camera-filter"
            className="btn btn-compact"
            value={cameraFilter ?? 'ALL'}
            onChange={(e) =>
              onCameraFilterChange(e.target.value === 'ALL' ? undefined : e.target.value)
            }
          >
            <option value="ALL">All Cameras</option>
            {cameraSlots.map((c) => (
              <option key={c.id} value={c.id}>
                {c.id}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="evidence-feed">
        {violations.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
            No violations matching current filter.
          </div>
        ) : (
          violations.map((v) => (
            <ViolationCard
              key={v.id}
              violation={v}
              relativeNowMs={relativeNowMs}
              onOpenEvidence={onOpenEvidence}
              onReview={onReview}
            />
          ))
        )}
      </div>
    </aside>
  );
}
