import React, { useEffect, useRef, useState } from 'react';
import {
  useAuth,
  useLiveStream,
  useViolationAlerts,
  useViolations,
  useReviewViolation,
  useOverviewStats,
  useCameras,
  useAudioAlert,
} from './hooks';
import { evidenceApi } from './api/evidence.api';
import { exportViolationsToCsv } from './utils/export';
import { formatConfidence, formatDateTime } from './utils/formatters';
import { VIOLATION_STATUS_CONFIG, getLightConfig } from './config/constants';
import { Violation, ViolationStatus } from './types/violation.types';
import './styles/dashboard.css';

function bindDialogLightDismissFallback(dialog: HTMLDialogElement | null) {
  if (!dialog || typeof HTMLDialogElement === 'undefined') return () => {};
  if ('closedBy' in HTMLDialogElement.prototype) return () => {};

  const handleClick = (event: MouseEvent) => {
    if (event.target !== dialog) return;
    const rect = dialog.getBoundingClientRect();
    const isDialogContent =
      rect.top <= event.clientY &&
      event.clientY <= rect.top + rect.height &&
      rect.left <= event.clientX &&
      event.clientX <= rect.left + rect.width;
    if (isDialogContent) return;
    dialog.close();
  };

  dialog.addEventListener('click', handleClick);
  return () => dialog.removeEventListener('click', handleClick);
}

export function App() {
  const [activeTab, setActiveTab] = useState<'monitor' | 'analytics'>('monitor');
  const [statusFilter, setStatusFilter] = useState<ViolationStatus | undefined>(undefined);
  const [previewItem, setPreviewItem] = useState<{ url: string; title: string } | null>(null);
  const [email, setEmail] = useState('admin@vdat.local');
  const [password, setPassword] = useState('admin123');

  const auth = useAuth();
  const stream = useLiveStream();
  const alerts = useViolationAlerts();
  const audio = useAudioAlert();

  const violationsQuery = useViolations({
    page: 1,
    limit: 50,
    status: statusFilter,
  });
  const reviewMutation = useReviewViolation();
  const statsQuery = useOverviewStats(15000);
  const camerasQuery = useCameras();

  const previewDialogRef = useRef<HTMLDialogElement>(null);
  const loginDialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const cleanPreview = bindDialogLightDismissFallback(previewDialogRef.current);
    const cleanLogin = bindDialogLightDismissFallback(loginDialogRef.current);
    return () => {
      cleanPreview();
      cleanLogin();
    };
  }, []);

  const openPreview = (url: string, title: string) => {
    if (!url) return;
    setPreviewItem({ url, title });
    previewDialogRef.current?.showModal();
  };

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await auth.login({ email, password });
      loginDialogRef.current?.close();
    } catch {
      // Error is stored in auth.error
    }
  };

  // Merge live WebSocket alerts with stored database violations without duplicates
  const storedViolations = violationsQuery.data?.data ?? [];
  const mergedViolations: Violation[] = [];
  const seenIds = new Set<string>();

  for (const v of [...alerts.liveAlerts, ...storedViolations]) {
    if (!seenIds.has(v.id)) {
      if (!statusFilter || v.status === statusFilter) {
        seenIds.add(v.id);
        mergedViolations.push(v);
      }
    }
  }

  const lightCfg = getLightConfig(stream.telemetry.light_state);

  return (
    <>
      <header className="site-header">
        <div className="header-inner">
          <div className="brand-bar">
            <span>🚦 VDAT Surveillance Hub</span>
            <span className={`badge ${stream.latestFrameImage ? 'badge-live' : 'badge-standby'}`}>
              {stream.latestFrameImage
                ? 'LIVE STREAMING'
                : stream.isConnected
                  ? 'Connected (Standby)'
                  : 'Reconnecting...'}
            </span>
          </div>

          <nav className="toolbar-actions" aria-label="Main navigation">
            <button
              type="button"
              className={`btn ${activeTab === 'monitor' ? 'btn-active' : ''}`}
              onClick={() => setActiveTab('monitor')}
            >
              📹 Live Monitor
            </button>
            <button
              type="button"
              className={`btn ${activeTab === 'analytics' ? 'btn-active' : ''}`}
              onClick={() => setActiveTab('analytics')}
            >
              📊 Fleet &amp; Analytics
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => audio.setSoundAlertsEnabled(!audio.soundAlertsEnabled)}
            >
              {audio.soundAlertsEnabled ? '🔔 Audio On' : '🔕 Audio Muted'}
            </button>
            {auth.isAuthenticated ? (
              <button type="button" className="btn" onClick={auth.logout}>
                👤 {auth.user?.fullName} ({auth.role}) • Sign Out
              </button>
            ) : (
              <button
                type="button"
                className="btn"
                onClick={() => loginDialogRef.current?.showModal()}
              >
                🔐 Officer Sign In
              </button>
            )}
          </nav>
        </div>
      </header>

      {activeTab === 'monitor' ? (
        <main className="workspace-grid">
          {/* Left Column: Live Stream Viewport + Telemetry HUD */}
          <section className="card card-stream" aria-labelledby="stream-title">
            <div className="card-header">
              <span id="stream-title">
                📹 Live Camera Stream ({stream.selectedCameraId})
              </span>
              <div className="toolbar-actions">
                <span className="badge" style={{ color: lightCfg.color }}>
                  Light: {lightCfg.label}
                </span>
                <button
                  type="button"
                  className="btn btn-compact"
                  onClick={stream.togglePause}
                >
                  {stream.isPaused ? '▶️ Resume' : '⏸️ Pause'}
                </button>
              </div>
            </div>

            <div className="video-viewport">
              {stream.latestFrameImage ? (
                <img
                  className="stream-canvas"
                  src={`data:image/jpeg;base64,${stream.latestFrameImage}`}
                  alt={`Live feed from ${stream.selectedCameraId}`}
                />
              ) : (
                <div className="stream-placeholder">
                  <div className="spinner" aria-hidden="true" />
                  <span>Connecting to AI stream relay...</span>
                  <span style={{ fontSize: '0.78rem' }}>
                    Run AI Engine with <code>--ws</code> to stream frames
                  </span>
                </div>
              )}
            </div>

            <div className="hud-wrapper">
              <div className="hud-bar">
                <div className="stat-box">
                  <div className="stat-label">Active Vehicles</div>
                  <div className="stat-value">{stream.telemetry.vehicle_count ?? 0}</div>
                </div>
                <div className="stat-box">
                  <div className="stat-label">Total Tracked</div>
                  <div className="stat-value">{stream.telemetry.total_tracked ?? 0}</div>
                </div>
                <div className="stat-box">
                  <div className="stat-label">Violation Count</div>
                  <div className="stat-value" style={{ color: 'var(--danger)' }}>
                    {stream.telemetry.violations_count ?? mergedViolations.length}
                  </div>
                </div>
                <div className="stat-box">
                  <div className="stat-label">Stream FPS</div>
                  <div className="stat-value">{stream.telemetry.fps ?? 0} FPS</div>
                </div>
              </div>
            </div>
          </section>

          {/* Right Column: Violation Proofs & Officer Review */}
          <aside className="card card-sidebar" aria-labelledby="proofs-title">
            <div className="card-header">
              <span id="proofs-title">
                🚨 Violation Proofs ({mergedViolations.length})
              </span>
              <div className="toolbar-actions">
                <button
                  type="button"
                  className="btn btn-compact"
                  onClick={() => exportViolationsToCsv(mergedViolations)}
                  disabled={mergedViolations.length === 0}
                >
                  📥 Export CSV
                </button>
                <button
                  type="button"
                  className="btn btn-compact"
                  onClick={() => violationsQuery.refetch()}
                >
                  🔄 Refresh
                </button>
              </div>
            </div>

            <div className="filter-bar" role="group" aria-label="Filter violations by status">
              {(['ALL', 'PENDING_REVIEW', 'CONFIRMED', 'DISMISSED'] as const).map((st) => {
                const isSelected = (st === 'ALL' && !statusFilter) || st === statusFilter;
                return (
                  <button
                    key={st}
                    type="button"
                    className={`btn btn-compact ${isSelected ? 'btn-active' : ''}`}
                    onClick={() => setStatusFilter(st === 'ALL' ? undefined : st)}
                  >
                    {st === 'ALL' ? 'All' : VIOLATION_STATUS_CONFIG[st].label}
                  </button>
                );
              })}
            </div>

            <div className="evidence-feed">
              {mergedViolations.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
                  No violations matching current filter.
                </div>
              ) : (
                mergedViolations.map((v) => {
                  const snapshotUrl = evidenceApi.resolveMediaUrl(v.snapshotUrl);
                  const clipUrl = evidenceApi.resolveMediaUrl(v.evidenceClipUrl);
                  const statusCfg = VIOLATION_STATUS_CONFIG[v.status];

                  return (
                    <article key={v.id} className="violation-card">
                      <img
                        className="violation-thumb"
                        src={
                          snapshotUrl ||
                          'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="108" height="68"><rect fill="%231e293b" width="108" height="68"/><text fill="%2364748b" x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" font-size="10">No Image</text></svg>'
                        }
                        alt={`Violation #${v.trackId}`}
                        onClick={() =>
                          openPreview(
                            snapshotUrl,
                            `Violation #${v.trackId} (${v.vehicleClass}) — Frame ${v.frameNumber}`
                          )
                        }
                      />
                      <div className="violation-info">
                        <div className="violation-title">
                          <span>🚨 #{v.trackId}</span>
                          <span style={{ textTransform: 'capitalize' }}>{v.vehicleClass}</span>
                          <span
                            className="badge"
                            style={{
                              color: statusCfg.color,
                              background: statusCfg.bgColor,
                              border: `1px solid ${statusCfg.borderColor}`,
                              fontSize: '0.62rem',
                            }}
                          >
                            {statusCfg.label}
                          </span>
                        </div>
                        <div className="violation-meta">
                          Frame {v.frameNumber} • {v.timestamp} • Conf:{' '}
                          {formatConfidence(v.confidence)}
                        </div>
                        <div className="violation-actions">
                          {snapshotUrl && (
                            <a
                              href={snapshotUrl}
                              download
                              className="btn btn-compact btn-success"
                            >
                              📥 Snapshot
                            </a>
                          )}
                          {clipUrl ? (
                            <a href={clipUrl} download className="btn btn-compact btn-purple">
                              🎬 Video Clip
                            </a>
                          ) : (
                            <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                              Clip encoding...
                            </span>
                          )}
                          {auth.isAuthenticated && v.status === 'PENDING_REVIEW' && (
                            <>
                              <button
                                type="button"
                                className="btn btn-compact btn-danger"
                                onClick={() =>
                                  reviewMutation.mutate({
                                    id: v.id,
                                    payload: { status: 'CONFIRMED' },
                                  })
                                }
                              >
                                ✓ Confirm
                              </button>
                              <button
                                type="button"
                                className="btn btn-compact"
                                onClick={() =>
                                  reviewMutation.mutate({
                                    id: v.id,
                                    payload: { status: 'DISMISSED' },
                                  })
                                }
                              >
                                ✕ Dismiss
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    </article>
                  );
                })
              )}
            </div>
          </aside>
        </main>
      ) : (
        <main className="workspace-single">
          <section className="kpi-grid" aria-label="Key metrics">
            <div className="stat-box">
              <div className="stat-label">Total Violations</div>
              <div className="stat-value">
                {statsQuery.data?.summary.totalViolations ?? mergedViolations.length}
              </div>
            </div>
            <div className="stat-box">
              <div className="stat-label">Pending Review</div>
              <div className="stat-value" style={{ color: 'var(--warning)' }}>
                {statsQuery.data?.summary.pendingReview ?? 0}
              </div>
            </div>
            <div className="stat-box">
              <div className="stat-label">Confirmed Violations</div>
              <div className="stat-value" style={{ color: 'var(--danger)' }}>
                {statsQuery.data?.summary.confirmed ?? 0}
              </div>
            </div>
            <div className="stat-box">
              <div className="stat-label">Dismissed</div>
              <div className="stat-value" style={{ color: 'var(--success)' }}>
                {statsQuery.data?.summary.dismissed ?? 0}
              </div>
            </div>
            <div className="stat-box">
              <div className="stat-label">Active AI Cameras</div>
              <div className="stat-value">
                {statsQuery.data?.summary.activeCamerasCount ?? stream.activeCameras.length}
              </div>
            </div>
          </section>

          <div className="analytics-columns">
            <section className="card">
              <div className="card-header">
                <span>📹 Registered Camera Fleet</span>
              </div>
              <div className="data-list">
                {(camerasQuery.data ?? []).length === 0 ? (
                  <div className="data-row">
                    <span>cam-01 — Intersection Surveillance</span>
                    <span className="badge badge-standby">Registered</span>
                  </div>
                ) : (
                  camerasQuery.data?.map((cam) => (
                    <div key={cam.id} className="data-row">
                      <div>
                        <strong>{cam.name}</strong> ({cam.id})
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                          {cam.location} • Last seen: {formatDateTime(cam.lastSeenAt)}
                        </div>
                      </div>
                      <span className={`badge ${cam.isLive ? 'badge-live' : 'badge-standby'}`}>
                        {cam.isLive ? 'LIVE' : 'STANDBY'}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </section>

            <section className="card">
              <div className="card-header">
                <span>🚗 Violations by Vehicle Class</span>
              </div>
              <div className="data-list">
                {(statsQuery.data?.byVehicleClass ?? []).length === 0 ? (
                  <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                    Sign in as Officer or Admin to view full vehicle class aggregations.
                  </div>
                ) : (
                  statsQuery.data?.byVehicleClass.map((item) => (
                    <div key={item.class} className="data-row">
                      <span style={{ textTransform: 'capitalize' }}>{item.class}</span>
                      <strong>{item.count} violations</strong>
                    </div>
                  ))
                )}
              </div>
            </section>
          </div>
        </main>
      )}

      {/* Snapshot Preview Modal with Light-Dismiss */}
      <dialog
        ref={previewDialogRef}
        {...({ closedby: 'any' } as any)}
        className="app-dialog"
        aria-labelledby="preview-dialog-title"
      >
        <div className="dialog-header">
          <span id="preview-dialog-title">{previewItem?.title ?? 'Snapshot Preview'}</span>
          <form method="dialog">
            <button type="submit" className="btn btn-compact">
              ✕ Close
            </button>
          </form>
        </div>
        <div className="dialog-body" style={{ background: '#000', placeItems: 'center' }}>
          {previewItem && (
            <img
              src={previewItem.url}
              alt={previewItem.title}
              style={{ maxBlockSize: '75dvh', objectFit: 'contain' }}
            />
          )}
        </div>
      </dialog>

      {/* Officer / Admin Sign-In Dialog with Light-Dismiss */}
      <dialog
        ref={loginDialogRef}
        {...({ closedby: 'any' } as any)}
        className="app-dialog"
        aria-labelledby="login-dialog-title"
      >
        <div className="dialog-header">
          <span id="login-dialog-title">🔐 VDAT Officer / Admin Sign In</span>
          <form method="dialog">
            <button type="submit" className="btn btn-compact">
              ✕ Close
            </button>
          </form>
        </div>
        <form className="dialog-body form-grid" onSubmit={handleLoginSubmit}>
          <label className="form-field">
            <span>Email Address</span>
            <input
              type="email"
              className="form-input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </label>
          <label className="form-field">
            <span>Password</span>
            <input
              type="password"
              className="form-input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </label>
          {auth.error && (
            <div style={{ color: 'var(--danger)', fontSize: '0.8rem' }}>{auth.error}</div>
          )}
          <div className="toolbar-actions">
            <button
              type="button"
              className="btn btn-compact"
              onClick={() => {
                setEmail('admin@vdat.local');
                setPassword('admin123');
              }}
            >
              Fill Admin
            </button>
            <button
              type="button"
              className="btn btn-compact"
              onClick={() => {
                setEmail('officer@vdat.local');
                setPassword('police123');
              }}
            >
              Fill Officer
            </button>
            <button
              type="submit"
              className="btn btn-active"
              style={{ marginInlineStart: 'auto' }}
              disabled={auth.isLoading}
            >
              {auth.isLoading ? 'Signing in...' : 'Sign In'}
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}

