import { formatDateTime } from '../../utils/formatters';
import type { useAuth } from '../../hooks/useAuth';
import type { Camera } from '../../types/camera.types';
import type { OverviewStats } from '../../types/stats.types';

type AuthHook = ReturnType<typeof useAuth>;

interface AnalyticsViewProps {
  auth: AuthHook;
  stats?: OverviewStats;
  cameras?: Camera[];
  activeCameraCount: number;
  fallbackTotal: number;
  onAnnotate: (camId: string) => void;
}

export function AnalyticsView({
  auth,
  stats,
  cameras,
  activeCameraCount,
  fallbackTotal,
  onAnnotate,
}: AnalyticsViewProps) {
  return (
    <main className="workspace-single">
      <section className="kpi-grid" aria-label="Key metrics">
        <div className="stat-box">
          <div className="stat-label">Total Violations</div>
          <div className="stat-value">{stats?.summary.totalViolations ?? fallbackTotal}</div>
        </div>
        <div className="stat-box">
          <div className="stat-label">Pending Review</div>
          <div className="stat-value" style={{ color: 'var(--warning)' }}>
            {stats?.summary.pendingReview ?? 0}
          </div>
        </div>
        <div className="stat-box">
          <div className="stat-label">Confirmed Violations</div>
          <div className="stat-value" style={{ color: 'var(--danger)' }}>
            {stats?.summary.confirmed ?? 0}
          </div>
        </div>
        <div className="stat-box">
          <div className="stat-label">Dismissed</div>
          <div className="stat-value" style={{ color: 'var(--success)' }}>
            {stats?.summary.dismissed ?? 0}
          </div>
        </div>
        <div className="stat-box">
          <div className="stat-label">Active AI Cameras</div>
          <div className="stat-value">{stats?.summary.activeCamerasCount ?? activeCameraCount}</div>
        </div>
      </section>

      <div className="analytics-columns">
        <section className="card">
          <div className="card-header">
            <span>Registered Camera Fleet</span>
          </div>
          <div className="data-list">
            {(cameras ?? []).length === 0 ? (
              <div className="data-row">
                <span>cam-01 — Intersection Surveillance</span>
                <span className="badge badge-standby">Registered</span>
              </div>
            ) : (
              cameras?.map((cam) => (
                <div key={cam.id} className="data-row">
                  <div>
                    <strong>{cam.name}</strong> ({cam.id})
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                      {cam.location} • Last seen: {formatDateTime(cam.lastSeenAt)}
                    </div>
                  </div>
                  <div className="toolbar-actions">
                    {auth.isAdmin && (
                      <button
                        type="button"
                        className="btn btn-compact"
                        onClick={() => onAnnotate(cam.id)}
                      >
                        Annotate Zones
                      </button>
                    )}
                    <span className={`badge ${cam.isLive ? 'badge-live' : 'badge-standby'}`}>
                      {cam.isLive ? 'LIVE' : 'STANDBY'}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>

        <section className="card">
          <div className="card-header">
            <span>Violations by Vehicle Class</span>
          </div>
          <div className="data-list">
            {(stats?.byVehicleClass ?? []).length === 0 ? (
              <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                No vehicle class violation records found.
              </div>
            ) : (
              stats?.byVehicleClass.map((item) => (
                <div key={item.class} className="data-row">
                  <span style={{ textTransform: 'capitalize' }}>{item.class}</span>
                  <strong>
                    {item.count} {item.count === 1 ? 'violation' : 'violations'}
                  </strong>
                </div>
              ))
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
