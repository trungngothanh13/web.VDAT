import React, { useEffect, useRef, useState } from 'react';
import {
  useAuth,
  useLiveStream,
  useViolationAlerts,
  useViolations,
  useReviewViolation,
  useOverviewStats,
  useCameras,
  useCreateCamera,
  useUpdateZones,
  useZoneEditor,
  useAudioAlert,
  useMultiCameraTransmitter,
} from './hooks';
import { evidenceApi } from './api/evidence.api';
import { exportViolationsToCsv } from './utils/export';
import { formatConfidence, formatDateTime } from './utils/formatters';
import {
  VIOLATION_STATUS_CONFIG,
  getLightConfig,
  DEFAULT_CAMERA_WIDTH,
  DEFAULT_CAMERA_HEIGHT,
} from './config/constants';
import { Violation, ViolationStatus } from './types/violation.types';
import { TrafficLightSamplingBox } from './types/camera.types';
import './styles/dashboard.css';

const DEFAULT_ZONES_FALLBACK = {
  lanes: [
    [
      [429, 161],
      [433, 247],
      [550, 230],
      [560, 213],
      [577, 213],
      [581, 203],
      [637, 181],
      [696, 167],
      [730, 158],
      [717, 139],
      [601, 148],
      [584, 142],
      [434, 156],
    ] as [number, number][],
  ],
  intersection: [
    [429, 157],
    [432, 246],
    [226, 273],
    [149, 293],
    [154, 186],
    [205, 171],
    [426, 158],
  ] as [number, number][],
  lightBoxes: [
    { x: 570, y: 148, color: 'green' as const },
    { x: 570, y: 130, color: 'red' as const },
  ],
};

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
  const auth = useAuth();

  const [activeTab, setActiveTab] = useState<'monitor' | 'zones' | 'analytics'>('monitor');
  const [statusFilter, setStatusFilter] = useState<ViolationStatus | undefined>(undefined);
  const [cameraFilter, setCameraFilter] = useState<string | undefined>(undefined);
  const [activeEvidence, setActiveEvidence] = useState<{
    violation: Violation;
    mediaTab: 'video' | 'snapshot';
  } | null>(null);

  // Multi-camera registration state (Admin)
  const [showAddCamera, setShowAddCamera] = useState(false);
  const [newCamId, setNewCamId] = useState('');
  const [newCamName, setNewCamName] = useState('');
  const [newCamLocation, setNewCamLocation] = useState('');
  const [addCameraError, setAddCameraError] = useState<string | null>(null);

  // Sign-In Form State
  const [email, setEmail] = useState('admin@vdat.local');
  const [password, setPassword] = useState('admin123');
  const [showPassword, setShowPassword] = useState(false);

  // Zone Editor State
  const [useLiveFrameInEditor, setUseLiveFrameInEditor] = useState(false);
  const [zoneSyncBanner, setZoneSyncBanner] = useState<string | null>(null);
  const [isDraggingVertex, setIsDraggingVertex] = useState(false);

  // Protected hooks only connect/fetch when authenticated
  const stream = useLiveStream({ autoConnect: auth.isAuthenticated });
  const transmitters = useMultiCameraTransmitter();
  const focusedCameraId = stream.selectedCameraId || 'cam-01';
  const focusedChannel = transmitters.getChannel(focusedCameraId);
  const tileFileInputsRef = useRef<Record<string, HTMLInputElement | null>>({});
  const focusedFileInputRef = useRef<HTMLInputElement>(null);
  const alerts = useViolationAlerts();
  const audio = useAudioAlert();

  const violationsQuery = useViolations(
    {
      page: 1,
      limit: 50,
      status: statusFilter,
      cameraId: cameraFilter,
    },
    auth.isAuthenticated
  );
  const reviewMutation = useReviewViolation();
  const statsQuery = useOverviewStats(15000, auth.isAuthenticated);
  const camerasQuery = useCameras(auth.isAuthenticated);
  const createCameraMutation = useCreateCamera();
  const updateZonesMutation = useUpdateZones();

  const zoneEditor = useZoneEditor(DEFAULT_ZONES_FALLBACK);
  const zoneCanvasRef = useRef<HTMLCanvasElement>(null);
  const initializedCameraConfigRef = useRef<string | null>(null);

  const evidenceDialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const cleanDialog = bindDialogLightDismissFallback(evidenceDialogRef.current);
    return () => cleanDialog();
  }, [auth.isAuthenticated]);

  // Load camera zone config from API when camerasQuery resolves
  const currentCamera =
    camerasQuery.data?.find((c) => c.id === stream.selectedCameraId) ?? camerasQuery.data?.[0];

  useEffect(() => {
    if (!currentCamera?.config) return;
    const configKey = `${currentCamera.id}-v${currentCamera.config.version}`;
    if (initializedCameraConfigRef.current === configKey) return;
    initializedCameraConfigRef.current = configKey;

    const rawLightBox = currentCamera.config.lightBox;
    const lightBoxes: TrafficLightSamplingBox[] = Array.isArray(rawLightBox)
      ? (rawLightBox as TrafficLightSamplingBox[])
      : DEFAULT_ZONES_FALLBACK.lightBoxes;

    zoneEditor.loadGeometry({
      lanes: Array.isArray(currentCamera.config.lanes)
        ? currentCamera.config.lanes
        : DEFAULT_ZONES_FALLBACK.lanes,
      intersection: Array.isArray(currentCamera.config.intersection)
        ? currentCamera.config.intersection
        : DEFAULT_ZONES_FALLBACK.intersection,
      lightBoxes,
    });
  }, [currentCamera, zoneEditor]);

  // Draw Zone Editor overlays onto <canvas>
  useEffect(() => {
    if (activeTab !== 'zones') return;
    const canvas = zoneCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, DEFAULT_CAMERA_WIDTH, DEFAULT_CAMERA_HEIGHT);

    // 1. Draw completed Lanes (Yellow polygons matching zone_drawer.py)
    zoneEditor.geometry.lanes.forEach((lane, idx) => {
      if (lane.length < 3) return;
      ctx.beginPath();
      ctx.moveTo(lane[0][0], lane[0][1]);
      for (let i = 1; i < lane.length; i++) {
        ctx.lineTo(lane[i][0], lane[i][1]);
      }
      ctx.closePath();
      ctx.fillStyle =
        zoneEditor.selectedLaneIndex === idx
          ? 'rgba(234, 179, 8, 0.32)'
          : 'rgba(234, 179, 8, 0.18)';
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#eab308';
      ctx.stroke();

      // Draw vertices & label
      lane.forEach((pt, vIdx) => {
        ctx.beginPath();
        ctx.arc(pt[0], pt[1], 4.5, 0, Math.PI * 2);
        ctx.fillStyle =
          zoneEditor.selectedVertex?.target === 'lane' &&
          zoneEditor.selectedVertex.index === idx &&
          zoneEditor.selectedVertex.vertexIndex === vIdx
            ? '#ffffff'
            : '#facc15';
        ctx.fill();
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 1;
        ctx.stroke();
      });

      ctx.font = '600 12px Inter, sans-serif';
      ctx.fillStyle = '#fef08a';
      ctx.fillText(`Lane ${idx + 1}`, lane[0][0] + 6, lane[0][1] - 6);
    });

    // 2. Draw Intersection polygon (Blue polygon matching zone_drawer.py)
    const inter = zoneEditor.geometry.intersection;
    if (inter.length >= 3) {
      ctx.beginPath();
      ctx.moveTo(inter[0][0], inter[0][1]);
      for (let i = 1; i < inter.length; i++) {
        ctx.lineTo(inter[i][0], inter[i][1]);
      }
      ctx.closePath();
      ctx.fillStyle = 'rgba(59, 130, 246, 0.22)';
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#3b82f6';
      ctx.stroke();

      inter.forEach((pt, vIdx) => {
        ctx.beginPath();
        ctx.arc(pt[0], pt[1], 4.5, 0, Math.PI * 2);
        ctx.fillStyle =
          zoneEditor.selectedVertex?.target === 'intersection' &&
          zoneEditor.selectedVertex.vertexIndex === vIdx
            ? '#ffffff'
            : '#60a5fa';
        ctx.fill();
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 1;
        ctx.stroke();
      });

      ctx.font = '600 12px Inter, sans-serif';
      ctx.fillStyle = '#93c5fd';
      ctx.fillText('Intersection', inter[0][0] + 6, inter[0][1] - 6);
    }

    // 3. Draw Traffic Light sampling windows (25x25px window, radius=12 matching TrafficLightDetector)
    zoneEditor.geometry.lightBoxes.forEach((lb, idx) => {
      const isGreen = lb.color === 'green';
      const strokeColor = isGreen ? '#22c55e' : '#ef4444';
      const fillColor = isGreen ? 'rgba(34, 197, 94, 0.25)' : 'rgba(239, 68, 68, 0.25)';

      ctx.fillStyle = fillColor;
      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = 2;
      ctx.fillRect(lb.x - 12, lb.y - 12, 24, 24);
      ctx.strokeRect(lb.x - 12, lb.y - 12, 24, 24);

      ctx.beginPath();
      ctx.arc(lb.x, lb.y, 4, 0, Math.PI * 2);
      ctx.fillStyle = strokeColor;
      ctx.fill();

      ctx.font = '600 11px Inter, sans-serif';
      ctx.fillStyle = strokeColor;
      ctx.fillText(
        `${(lb.color || 'red').toUpperCase()} #${idx + 1} (${lb.x},${lb.y})`,
        lb.x + 16,
        lb.y + 4
      );
    });

    // 4. Draw in-progress polygon points (Cyan)
    const activePts = zoneEditor.activeDrawingPoints;
    if (activePts.length > 0) {
      ctx.beginPath();
      ctx.moveTo(activePts[0][0], activePts[0][1]);
      for (let i = 1; i < activePts.length; i++) {
        ctx.lineTo(activePts[i][0], activePts[i][1]);
      }
      ctx.strokeStyle = '#06b6d4';
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 4]);
      ctx.stroke();
      ctx.setLineDash([]);

      activePts.forEach((pt, idx) => {
        ctx.beginPath();
        ctx.arc(pt[0], pt[1], idx === 0 ? 6 : 4.5, 0, Math.PI * 2);
        ctx.fillStyle = idx === 0 ? '#22d3ee' : '#ffffff';
        ctx.fill();
        ctx.strokeStyle = '#0891b2';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      });
    }
  }, [
    activeTab,
    zoneEditor.geometry,
    zoneEditor.activeDrawingPoints,
    zoneEditor.selectedLaneIndex,
    zoneEditor.selectedVertex,
  ]);

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await auth.login({ email, password });
    } catch {
      // Error is stored in auth.error
    }
  };

  const openEvidenceViewer = (violation: Violation, preferredTab?: 'video' | 'snapshot') => {
    const hasClip = Boolean(violation.evidenceClipUrl);
    setActiveEvidence({
      violation,
      mediaTab: preferredTab ?? (hasClip ? 'video' : 'snapshot'),
    });
    evidenceDialogRef.current?.showModal();
  };

  const handleSaveZones = async () => {
    const targetCameraId = currentCamera?.id || stream.selectedCameraId || 'cam-01';
    setZoneSyncBanner(null);

    // If the user has an unfinished polygon with >= 3 points, automatically commit it before saving
    let nextLanes = zoneEditor.geometry.lanes;
    let nextIntersection = zoneEditor.geometry.intersection;
    if (zoneEditor.activeDrawingPoints.length >= 3) {
      const committedPolygon = [...zoneEditor.activeDrawingPoints];
      if (zoneEditor.mode === 'draw_lane') {
        nextLanes = [...nextLanes, committedPolygon];
      } else if (zoneEditor.mode === 'draw_intersection') {
        nextIntersection = committedPolygon;
      }
      zoneEditor.finishDrawing();
    }

    try {
      const response = await updateZonesMutation.mutateAsync({
        cameraId: targetCameraId,
        payload: {
          lanes: nextLanes,
          intersection: nextIntersection,
          lightBox: zoneEditor.geometry.lightBoxes,
        },
      });
      setZoneSyncBanner(response.message);
    } catch (err: any) {
      setZoneSyncBanner(err.message || 'Failed to save zone configuration.');
    }
  };

  // Strict Authentication Gate: Unauthenticated visitors cannot view the dashboard
  if (!auth.isAuthenticated) {
    return (
      <main className="auth-screen">
        <section className="auth-card" aria-labelledby="sign-in-heading">
          <div>
            <div className="badge badge-standby" style={{ marginBlockEnd: '0.6rem' }}>
              VDAT Surveillance Control
            </div>
            <h1 id="sign-in-heading" style={{ fontSize: '1.35rem', fontWeight: 700 }}>
              Sign In to VDAT Hub
            </h1>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBlockStart: '0.25rem' }}>
              Authorized Police Officer or System Administrator credentials are required to access live camera feeds, violation evidence streams, and zone configuration.
            </p>
          </div>

          <form
            className="form-grid"
            method="post"
            action="/api/auth/login"
            onSubmit={handleLoginSubmit}
          >
            <div className="form-field">
              <label htmlFor="email" className="form-label">
                Email Address
              </label>
              <input
                id="email"
                name="email"
                type="email"
                className="form-input"
                autoComplete="username"
                spellCheck={false}
                autoCapitalize="off"
                autoCorrect="off"
                enterKeyHint="next"
                value={email}
                onChange={(e) => {
                  if (auth.error) auth.clearError();
                  setEmail(e.target.value);
                }}
                required
              />
            </div>

            <div className="form-field">
              <label htmlFor="current-password" className="form-label">
                Password
              </label>
              <div className="password-input-row">
                <input
                  id="current-password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  className="form-input"
                  autoComplete="current-password"
                  enterKeyHint="done"
                  value={password}
                  onChange={(e) => {
                    if (auth.error) auth.clearError();
                    setPassword(e.target.value);
                  }}
                  required
                />
                <button
                  type="button"
                  className="btn"
                  aria-pressed={showPassword}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  onClick={() => setShowPassword((prev) => !prev)}
                >
                  {showPassword ? 'Hide' : 'Show'}
                </button>
              </div>
            </div>

            <div aria-live="polite">
              {auth.error && (
                <div
                  style={{
                    color: 'var(--danger-text)',
                    background: 'var(--danger-soft)',
                    border: '1px solid var(--danger-border)',
                    padding: '0.55rem 0.75rem',
                    borderRadius: 'var(--radius-sm)',
                    fontSize: '0.82rem',
                  }}
                >
                  {auth.error}
                </div>
              )}
            </div>

            <button
              type="submit"
              className="btn btn-active"
              style={{ minBlockSize: '48px', fontSize: '0.92rem', fontWeight: 600 }}
              disabled={auth.isLoading}
            >
              {auth.isLoading ? 'Signing In...' : 'Sign In'}
            </button>
          </form>

          <div className="account-preset-box">
            <div style={{ fontWeight: 600, color: 'var(--text)' }}>
              Registered Database Accounts (Quick Fill)
            </div>
            <div className="toolbar-actions">
              <button
                type="button"
                className="btn btn-compact"
                onClick={() => {
                  auth.clearError();
                  setEmail('admin@vdat.local');
                  setPassword('admin123');
                }}
              >
                Admin: admin@vdat.local (Full Access + Zone Editor)
              </button>
              <button
                type="button"
                className="btn btn-compact"
                onClick={() => {
                  auth.clearError();
                  setEmail('officer@vdat.local');
                  setPassword('police123');
                }}
              >
                Officer: officer@vdat.local (Monitor + Review)
              </button>
            </div>
          </div>
        </section>
      </main>
    );
  }

  // Merge live WebSocket alerts with stored database violations without duplicates
  const storedViolations = violationsQuery.data?.data ?? [];
  const mergedViolations: Violation[] = [];
  const seenIds = new Set<string>();

  for (const v of [...alerts.liveAlerts, ...storedViolations]) {
    if (!seenIds.has(v.id)) {
      const matchesStatus = !statusFilter || v.status === statusFilter;
      const matchesCamera = !cameraFilter || v.cameraId === cameraFilter;
      if (matchesStatus && matchesCamera) {
        seenIds.add(v.id);
        mergedViolations.push(v);
      }
    }
  }

  const cameraSlots =
    camerasQuery.data && camerasQuery.data.length > 0
      ? camerasQuery.data
      : [
          { id: 'cam-01', name: 'Camera 01 (Primary)', location: 'Intersection 1', isActive: false, createdAt: '', updatedAt: '' },
          { id: 'cam-02', name: 'Camera 02', location: 'Intersection 2', isActive: false, createdAt: '', updatedAt: '' },
          { id: 'cam-03', name: 'Camera 03', location: 'Intersection 3', isActive: false, createdAt: '', updatedAt: '' },
        ];

  const handleCreateCamera = async (e: React.FormEvent) => {
    e.preventDefault();
    setAddCameraError(null);
    const id = newCamId.trim();
    const name = newCamName.trim() || `Camera ${id}`;
    const location = newCamLocation.trim() || 'Intersection';
    if (!id) {
      setAddCameraError('Camera ID is required (e.g. cam-04).');
      return;
    }
    try {
      await createCameraMutation.mutateAsync({ id, name, location });
      setNewCamId('');
      setNewCamName('');
      setNewCamLocation('');
      setShowAddCamera(false);
    } catch (err: any) {
      setAddCameraError(err?.response?.data?.error || err.message || 'Failed to add camera.');
    }
  };

  const lightCfg = getLightConfig(stream.telemetry.light_state);

  const activeViolation = activeEvidence
    ? mergedViolations.find((v) => v.id === activeEvidence.violation.id) ?? activeEvidence.violation
    : null;
  const activeSnapshotUrl = activeViolation
    ? evidenceApi.resolveMediaUrl(activeViolation.snapshotUrl)
    : '';
  const activeStreamUrl = activeViolation
    ? evidenceApi.resolveMediaUrl(
        activeViolation.evidenceClipUrl ||
          `/api/evidence/stream/${activeViolation.cameraId}/violation_${activeViolation.cameraId}_id${activeViolation.trackId}_f${activeViolation.frameNumber}.mp4`
      )
    : '';
  const activeDownloadUrl = activeStreamUrl
    ? `${activeStreamUrl}${activeStreamUrl.includes('?') ? '&' : '?'}download=1`
    : '';

  return (
    <>
      <header className="site-header">
        <div className="header-inner">
          <div className="brand-bar">
            <span>VDAT Surveillance Hub</span>
            <span className={`badge ${stream.isCameraLive ? 'badge-live' : 'badge-standby'}`}>
              {stream.isCameraLive
                ? 'AI Engine Online'
                : stream.isConnected
                  ? 'AI Engine Offline'
                  : 'Backend Disconnected'}
            </span>
          </div>

          <nav className="toolbar-actions" aria-label="Main navigation">
            <button
              type="button"
              className={`btn ${activeTab === 'monitor' ? 'btn-active' : ''}`}
              onClick={() => setActiveTab('monitor')}
            >
              Live Monitor
            </button>
            {auth.isAdmin && (
              <button
                type="button"
                className={`btn ${activeTab === 'zones' ? 'btn-active' : ''}`}
                onClick={() => setActiveTab('zones')}
              >
                Zone Editor
              </button>
            )}
            <button
              type="button"
              className={`btn ${activeTab === 'analytics' ? 'btn-active' : ''}`}
              onClick={() => setActiveTab('analytics')}
            >
              Fleet &amp; Analytics
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => audio.setSoundAlertsEnabled(!audio.soundAlertsEnabled)}
            >
              {audio.soundAlertsEnabled ? 'Audio Alerts: On' : 'Audio Alerts: Muted'}
            </button>
            <span className="badge badge-standby">
              {auth.user?.fullName} ({auth.role})
            </span>
            <button type="button" className="btn btn-danger" onClick={auth.logout}>
              Sign Out
            </button>
          </nav>
        </div>
      </header>

      {activeTab === 'monitor' && (
        <main className="workspace-grid">
          {/* Left Column: Primary Focused AI Stream + Multi-Source Preview Wall */}
          <div className="primary-column">
            <section className="card card-stream" aria-labelledby="stream-title">
              <div className="card-header">
                <span id="stream-title">
                  Focused AI Stream ({focusedCameraId})
                  {focusedChannel.isBroadcasting ? ` — ${focusedChannel.sourceLabel}` : ''}
                </span>
                <div className="toolbar-actions">
                  <span className="badge" style={{ color: lightCfg.color }}>
                    Signal: {lightCfg.label}
                  </span>
                  {auth.isAdmin && (
                    <button
                      type="button"
                      className="btn btn-compact"
                      onClick={() => setActiveTab('zones')}
                    >
                      Edit Zones
                    </button>
                  )}
                  <button
                    type="button"
                    className="btn btn-compact"
                    onClick={stream.togglePause}
                  >
                    {stream.isPaused ? 'Resume Feed' : 'Pause Feed'}
                  </button>
                </div>
              </div>

              {/* Camera Input Source Selector for Currently Focused Camera */}
              <div
                className="filter-bar"
                role="region"
                aria-label="Focused camera input source"
                style={{ justifyContent: 'space-between', alignItems: 'center' }}
              >
                <div className="toolbar-actions">
                  <label
                    htmlFor="camera-source-select"
                    style={{ fontSize: '0.76rem', fontWeight: 600, color: 'var(--text-muted)' }}
                  >
                    Camera Input Source ({focusedCameraId}):
                  </label>
                  <input
                    ref={focusedFileInputRef}
                    type="file"
                    accept="video/*"
                    style={{ display: 'none' }}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        void transmitters.startVideoFileStream(focusedCameraId, file);
                        e.target.value = '';
                      }
                    }}
                  />
                  <select
                    id="camera-source-select"
                    className="btn btn-compact"
                    value={focusedChannel.sourcePreset}
                    onChange={(e) => {
                      const val = e.target.value as
                        | 'test_1.mp4'
                        | 'test_2.mp4'
                        | 'test_3.mp4'
                        | 'custom_file'
                        | 'laptop_webcam';
                      transmitters.setSourcePreset(focusedCameraId, val);
                      if (val === 'test_1.mp4' || val === 'test_2.mp4' || val === 'test_3.mp4') {
                        void transmitters.startSampleVideoStream(focusedCameraId, val);
                      } else if (val === 'laptop_webcam') {
                        void transmitters.startLaptopCameraStream(focusedCameraId);
                      } else if (val === 'custom_file') {
                        focusedFileInputRef.current?.click();
                      }
                    }}
                  >
                    <option value="test_1.mp4">Built-in Footage: test_1.mp4 (Intersection 1)</option>
                    <option value="test_2.mp4">Built-in Footage: test_2.mp4 (Intersection 2)</option>
                    <option value="test_3.mp4">Built-in Footage: test_3.mp4 (Intersection 3)</option>
                    <option value="custom_file">Custom Video File (From Computer...)</option>
                    <option value="laptop_webcam">Laptop Camera (Hardware Webcam)</option>
                  </select>

                  <button
                    type="button"
                    className="btn btn-compact btn-active"
                    onClick={() => {
                      const p = focusedChannel.sourcePreset;
                      if (p === 'test_1.mp4' || p === 'test_2.mp4' || p === 'test_3.mp4') {
                        void transmitters.startSampleVideoStream(focusedCameraId, p);
                      } else if (p === 'laptop_webcam') {
                        void transmitters.startLaptopCameraStream(focusedCameraId);
                      } else {
                        focusedFileInputRef.current?.click();
                      }
                    }}
                  >
                    {focusedChannel.isBroadcasting ? 'Restart Source' : 'Start Selected Source'}
                  </button>

                  <button
                    type="button"
                    className="btn btn-compact"
                    onClick={() => focusedFileInputRef.current?.click()}
                  >
                    Browse Video File...
                  </button>

                  {focusedChannel.sourcePreset === 'laptop_webcam' &&
                    transmitters.webcamDevices.length > 0 && (
                      <select
                        aria-label="Select laptop camera device"
                        className="btn btn-compact"
                        value={focusedChannel.selectedDeviceId}
                        onChange={(e) => {
                          transmitters.setSelectedDeviceId(focusedCameraId, e.target.value);
                          void transmitters.startLaptopCameraStream(
                            focusedCameraId,
                            e.target.value
                          );
                        }}
                      >
                        {transmitters.webcamDevices.map((dev) => (
                          <option key={dev.deviceId} value={dev.deviceId}>
                            {dev.label}
                          </option>
                        ))}
                      </select>
                    )}
                </div>

                <div className="toolbar-actions">
                  <label
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.35rem',
                      fontSize: '0.74rem',
                      color: 'var(--text-muted)',
                      cursor: 'pointer',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={focusedChannel.loopVideo}
                      onChange={(e) =>
                        transmitters.setLoopVideo(focusedCameraId, e.target.checked)
                      }
                    />
                    Loop Video
                  </label>
                  {focusedChannel.isBroadcasting && (
                    <>
                      <span className="badge badge-live">
                        Streaming ({focusedChannel.transmittedFrames} frames)
                      </span>
                      <button
                        type="button"
                        className="btn btn-compact btn-danger"
                        onClick={() => transmitters.stopBroadcast(focusedCameraId)}
                      >
                        Stop Source
                      </button>
                    </>
                  )}
                </div>
              </div>

              {focusedChannel.error && (
                <div
                  style={{
                    padding: '0.45rem 1rem',
                    background: 'var(--danger-soft)',
                    borderBlockEnd: '1px solid var(--danger-border)',
                    color: 'var(--danger-text)',
                    fontSize: '0.78rem',
                  }}
                >
                  {focusedChannel.error}
                </div>
              )}

              <div className="video-viewport">
                {stream.latestFrameImage && stream.isCameraLive ? (
                  <img
                    className="stream-canvas"
                    src={`data:image/jpeg;base64,${stream.latestFrameImage}`}
                    alt={`Live AI feed from ${focusedCameraId}`}
                  />
                ) : (
                  <div className="stream-placeholder">
                    <div className="spinner" aria-hidden="true" />
                    {focusedChannel.isBroadcasting && !stream.isCameraLive ? (
                      <>
                        <span style={{ color: 'var(--warning-text)', fontWeight: 600 }}>
                          Feeding &ldquo;{focusedChannel.sourceLabel}&rdquo; (
                          {focusedChannel.transmittedFrames} frames sent), but AI session for{' '}
                          <code>{focusedCameraId}</code> is not connected
                        </span>
                        <span style={{ fontSize: '0.78rem', maxInlineSize: '64ch' }}>
                          Start the multi-camera AI engine with{' '}
                          <code>
                            python main.py --web-input --cameras {cameraSlots.map((c) => c.id).join(' ')} --ws-url ws://localhost:5000/ws/inference --no-video
                          </code>
                        </span>
                      </>
                    ) : (
                      <>
                        <span>Waiting for AI-annotated camera stream ({focusedCameraId})</span>
                        <span style={{ fontSize: '0.78rem' }}>
                          Start a source on any camera slot below or above while the shared-YOLO AI module is connected
                        </span>
                      </>
                    )}
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

            {/* Multi-Source Camera Preview Wall (Raw Previews + Background AI Processing) */}
            <section className="card" aria-labelledby="camera-wall-title">
              <div className="card-header">
                <span id="camera-wall-title">
                  Multi-Camera Source Wall ({cameraSlots.length} Slots •{' '}
                  {stream.activeCameras.length} AI Online)
                </span>
                <div className="toolbar-actions">
                  {auth.isAdmin && (
                    <button
                      type="button"
                      className="btn btn-compact btn-active"
                      onClick={() => setShowAddCamera((prev) => !prev)}
                    >
                      {showAddCamera ? 'Cancel' : '+ Add Camera Slot'}
                    </button>
                  )}
                </div>
              </div>

              {showAddCamera && auth.isAdmin && (
                <form className="add-camera-form" onSubmit={handleCreateCamera}>
                  <label htmlFor="new-cam-id" style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>
                    ID:
                  </label>
                  <input
                    id="new-cam-id"
                    type="text"
                    className="add-camera-input"
                    placeholder="cam-04"
                    value={newCamId}
                    onChange={(e) => setNewCamId(e.target.value)}
                    required
                  />
                  <label htmlFor="new-cam-name" style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>
                    Name:
                  </label>
                  <input
                    id="new-cam-name"
                    type="text"
                    className="add-camera-input"
                    placeholder="Intersection 4"
                    value={newCamName}
                    onChange={(e) => setNewCamName(e.target.value)}
                    required
                  />
                  <label htmlFor="new-cam-loc" style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>
                    Location:
                  </label>
                  <input
                    id="new-cam-loc"
                    type="text"
                    className="add-camera-input"
                    placeholder="District 1"
                    value={newCamLocation}
                    onChange={(e) => setNewCamLocation(e.target.value)}
                  />
                  <button
                    type="submit"
                    className="btn btn-compact btn-success"
                    disabled={createCameraMutation.isPending}
                  >
                    {createCameraMutation.isPending ? 'Adding...' : 'Register Slot'}
                  </button>
                  {addCameraError && (
                    <span style={{ color: 'var(--danger-text)', fontSize: '0.74rem' }}>
                      {addCameraError}
                    </span>
                  )}
                </form>
              )}

              <div className="camera-wall-grid">
                {cameraSlots.map((cam) => {
                  const ch = transmitters.getChannel(cam.id);
                  const camTelemetry = stream.telemetryByCamera[cam.id];
                  const isAiOnline = stream.activeCameras.includes(cam.id);
                  const isFocused = focusedCameraId === cam.id;
                  const camLightCfg = getLightConfig(camTelemetry?.light_state);
                  const selectId = `tile-source-${cam.id}`;

                  return (
                    <article
                      key={cam.id}
                      className={`camera-tile ${isFocused ? 'camera-tile-focused' : ''}`}
                    >
                      <div className="camera-tile-media">
                        <canvas
                          ref={(el) => transmitters.bindPreviewCanvas(cam.id, el)}
                          width={427}
                          height={240}
                          className="camera-tile-canvas"
                        />
                        {!ch.isBroadcasting && (
                          <div className="camera-tile-placeholder">
                            <span>
                              No active source on <strong>{cam.id}</strong>
                              <br />
                              Pick a source below to feed the AI layer
                            </span>
                          </div>
                        )}
                      </div>

                      <header className="camera-tile-header">
                        <h3 className="camera-tile-title">
                          {cam.id} — {cam.name}
                        </h3>
                        <span className={`badge ${isAiOnline ? 'badge-live' : 'badge-standby'}`}>
                          {isAiOnline ? 'AI Online' : 'AI Offline'}
                        </span>
                      </header>

                      <div className="camera-tile-telemetry">
                        <span>Vehicles: {camTelemetry?.vehicle_count ?? 0}</span>
                        <span>Tracked: {camTelemetry?.total_tracked ?? 0}</span>
                        <span>Violations: {camTelemetry?.violations_count ?? cam.violationCount ?? 0}</span>
                        <span style={{ color: camLightCfg.color }}>{camLightCfg.label}</span>
                      </div>

                      <footer className="camera-tile-footer">
                        <div className="camera-tile-controls">
                          <label htmlFor={selectId} style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                            Source:
                          </label>
                          <input
                            ref={(el) => {
                              tileFileInputsRef.current[cam.id] = el;
                            }}
                            type="file"
                            accept="video/*"
                            style={{ display: 'none' }}
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file) {
                                void transmitters.startVideoFileStream(cam.id, file);
                                e.target.value = '';
                              }
                            }}
                          />
                          <select
                            id={selectId}
                            className="btn btn-compact"
                            value={ch.sourcePreset}
                            onChange={(e) => {
                              const val = e.target.value as
                                | 'test_1.mp4'
                                | 'test_2.mp4'
                                | 'test_3.mp4'
                                | 'custom_file'
                                | 'laptop_webcam';
                              transmitters.setSourcePreset(cam.id, val);
                              if (val === 'custom_file') {
                                tileFileInputsRef.current[cam.id]?.click();
                              } else if (val === 'laptop_webcam') {
                                void transmitters.startLaptopCameraStream(cam.id);
                              } else {
                                void transmitters.startSampleVideoStream(cam.id, val);
                              }
                            }}
                          >
                            <option value="test_1.mp4">test_1.mp4</option>
                            <option value="test_2.mp4">test_2.mp4</option>
                            <option value="test_3.mp4">test_3.mp4</option>
                            <option value="custom_file">Custom File...</option>
                            <option value="laptop_webcam">Laptop Webcam</option>
                          </select>
                        </div>

                        <div className="camera-tile-controls">
                          {ch.isBroadcasting ? (
                            <button
                              type="button"
                              className="btn btn-compact btn-danger"
                              onClick={() => transmitters.stopBroadcast(cam.id)}
                            >
                              Stop
                            </button>
                          ) : (
                            <button
                              type="button"
                              className="btn btn-compact btn-success"
                              onClick={() => {
                                const p = ch.sourcePreset;
                                if (p === 'custom_file') {
                                  tileFileInputsRef.current[cam.id]?.click();
                                } else if (p === 'laptop_webcam') {
                                  void transmitters.startLaptopCameraStream(cam.id);
                                } else {
                                  void transmitters.startSampleVideoStream(cam.id, p);
                                }
                              }}
                            >
                              Start Feed
                            </button>
                          )}

                          <button
                            type="button"
                            className={`btn btn-compact ${isFocused ? 'btn-active' : ''}`}
                            onClick={() => stream.setSelectedCamera(cam.id)}
                          >
                            {isFocused ? 'In AI Focus' : 'Inspect AI'}
                          </button>

                          {auth.isAdmin && (
                            <button
                              type="button"
                              className="btn btn-compact"
                              onClick={() => {
                                stream.setSelectedCamera(cam.id);
                                setActiveTab('zones');
                              }}
                            >
                              Zones
                            </button>
                          )}
                        </div>
                      </footer>
                    </article>
                  );
                })}
              </div>
            </section>
          </div>

          {/* Right Column: Violation Evidence Stream & Review */}
          <aside className="card card-sidebar" aria-labelledby="proofs-title">
            <div className="card-header">
              <span id="proofs-title">Violation Evidence ({mergedViolations.length})</span>
              <div className="toolbar-actions">
                <button
                  type="button"
                  className="btn btn-compact"
                  onClick={() => exportViolationsToCsv(mergedViolations)}
                  disabled={mergedViolations.length === 0}
                >
                  Export CSV
                </button>
                <button
                  type="button"
                  className="btn btn-compact"
                  onClick={() => violationsQuery.refetch()}
                >
                  Refresh
                </button>
              </div>
            </div>

            <div className="filter-bar" role="group" aria-label="Filter violations by status and camera" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
              <div className="toolbar-actions">
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

              <div className="toolbar-actions">
                <label htmlFor="violation-camera-filter" style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                  Camera:
                </label>
                <select
                  id="violation-camera-filter"
                  className="btn btn-compact"
                  value={cameraFilter ?? 'ALL'}
                  onChange={(e) => setCameraFilter(e.target.value === 'ALL' ? undefined : e.target.value)}
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
              {mergedViolations.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
                  No violations matching current filter.
                </div>
              ) : (
                mergedViolations.map((v) => {
                  const snapshotUrl = evidenceApi.resolveMediaUrl(v.snapshotUrl);
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
                        title="Click to stream video evidence"
                        onClick={() => openEvidenceViewer(v, 'video')}
                      />
                      <div className="violation-info">
                        <div className="violation-title">
                          <span className="badge badge-standby" style={{ fontSize: '0.62rem' }}>
                            {v.cameraId}
                          </span>
                          <span>Track #{v.trackId}</span>
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
                          Frame {v.frameNumber} ({v.timestamp}) • Confidence:{' '}
                          {formatConfidence(v.confidence)}
                        </div>
                        <div className="violation-actions">
                          <button
                            type="button"
                            className="btn btn-compact btn-purple"
                            onClick={() => openEvidenceViewer(v, 'video')}
                          >
                            Stream Video
                          </button>
                          <button
                            type="button"
                            className="btn btn-compact"
                            onClick={() => openEvidenceViewer(v, 'snapshot')}
                          >
                            Snapshot
                          </button>
                          {v.status === 'PENDING_REVIEW' && (
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
                                Confirm
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
                                Dismiss
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
      )}

      {activeTab === 'zones' && auth.isAdmin && (
        <main className="workspace-grid">
          {/* Left Column: Interactive 854x480 Zone Drawing Canvas */}
          <section className="card card-stream" aria-labelledby="zone-editor-title">
            <div className="card-header">
              <span id="zone-editor-title">
                Interactive Camera Zone Editor ({focusedCameraId} — 854x480)
              </span>
              <div className="toolbar-actions">
                <label htmlFor="zone-camera-select" style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>
                  Camera:
                </label>
                <select
                  id="zone-camera-select"
                  className="btn btn-compact"
                  value={focusedCameraId}
                  onChange={(e) => {
                    initializedCameraConfigRef.current = null;
                    stream.setSelectedCamera(e.target.value);
                  }}
                >
                  {cameraSlots.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.id} ({c.name})
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className={`btn btn-compact ${!useLiveFrameInEditor ? 'btn-active' : ''}`}
                  onClick={() => setUseLiveFrameInEditor(false)}
                >
                  Reference Frame
                </button>
                <button
                  type="button"
                  className={`btn btn-compact ${useLiveFrameInEditor ? 'btn-active' : ''}`}
                  onClick={() => setUseLiveFrameInEditor(true)}
                >
                  Live Stream Frame
                </button>
              </div>
            </div>

            <div className="filter-bar" role="group" aria-label="Zone drawing mode">
              <button
                type="button"
                className={`btn btn-compact ${zoneEditor.mode === 'draw_lane' ? 'btn-warning' : ''}`}
                onClick={() => {
                  zoneEditor.cancelDrawing();
                  zoneEditor.setMode('draw_lane');
                }}
              >
                1. Draw Lane ({zoneEditor.geometry.lanes.length})
              </button>
              <button
                type="button"
                className={`btn btn-compact ${
                  zoneEditor.mode === 'draw_intersection' ? 'btn-active' : ''
                }`}
                onClick={() => {
                  zoneEditor.cancelDrawing();
                  zoneEditor.setMode('draw_intersection');
                }}
              >
                2. Draw Intersection ({zoneEditor.geometry.intersection.length} pts)
              </button>
              <button
                type="button"
                className={`btn btn-compact ${
                  zoneEditor.mode === 'place_green_light' ? 'btn-success' : ''
                }`}
                onClick={() => {
                  zoneEditor.cancelDrawing();
                  zoneEditor.setMode('place_green_light');
                }}
              >
                3. Green Light Point
              </button>
              <button
                type="button"
                className={`btn btn-compact ${
                  zoneEditor.mode === 'place_red_light' ? 'btn-danger' : ''
                }`}
                onClick={() => {
                  zoneEditor.cancelDrawing();
                  zoneEditor.setMode('place_red_light');
                }}
              >
                4. Red Light Point
              </button>
              <button
                type="button"
                className={`btn btn-compact ${zoneEditor.mode === 'select' ? 'btn-active' : ''}`}
                onClick={() => {
                  zoneEditor.cancelDrawing();
                  zoneEditor.setMode('select');
                }}
              >
                Select / Move Vertex
              </button>
            </div>

            <div className="video-viewport">
              <img
                className="stream-canvas"
                src={
                  useLiveFrameInEditor && stream.latestFrameByCamera[focusedCameraId]
                    ? `data:image/jpeg;base64,${stream.latestFrameByCamera[focusedCameraId]}`
                    : transmitters.getChannelSnapshot(focusedCameraId) || '/cam-01-reference.jpg'
                }
                alt={`Reference frame for ${focusedCameraId} zone configuration`}
              />
              <canvas
                ref={zoneCanvasRef}
                width={DEFAULT_CAMERA_WIDTH}
                height={DEFAULT_CAMERA_HEIGHT}
                className="zone-canvas-overlay"
                style={{
                  cursor:
                    zoneEditor.mode === 'select'
                      ? isDraggingVertex
                        ? 'grabbing'
                        : 'grab'
                      : 'crosshair',
                }}
                onClick={(e) => {
                  if (isDraggingVertex) return;
                  const rect = e.currentTarget.getBoundingClientRect();
                  zoneEditor.handleCanvasClick(
                    e.clientX,
                    e.clientY,
                    rect,
                    DEFAULT_CAMERA_WIDTH,
                    DEFAULT_CAMERA_HEIGHT
                  );
                }}
                onMouseDown={() => {
                  if (zoneEditor.mode === 'select' && zoneEditor.selectedVertex) {
                    setIsDraggingVertex(true);
                  }
                }}
                onMouseMove={(e) => {
                  if (!isDraggingVertex || zoneEditor.mode !== 'select') return;
                  const rect = e.currentTarget.getBoundingClientRect();
                  zoneEditor.handleVertexDrag(
                    e.clientX,
                    e.clientY,
                    rect,
                    DEFAULT_CAMERA_WIDTH,
                    DEFAULT_CAMERA_HEIGHT
                  );
                }}
                onMouseUp={() => setIsDraggingVertex(false)}
                onMouseLeave={() => setIsDraggingVertex(false)}
              />
            </div>

            <div className="hud-wrapper">
              <div
                className="filter-bar"
                style={{ justifyContent: 'space-between', borderBlockEnd: 'none' }}
              >
                <div className="toolbar-actions">
                  <button
                    type="button"
                    className="btn btn-compact btn-success"
                    disabled={zoneEditor.activeDrawingPoints.length < 3}
                    onClick={() => zoneEditor.finishDrawing()}
                  >
                    Complete Polygon ({zoneEditor.activeDrawingPoints.length} pts)
                  </button>
                  <button
                    type="button"
                    className="btn btn-compact"
                    disabled={zoneEditor.activeDrawingPoints.length === 0}
                    onClick={() => zoneEditor.cancelDrawing()}
                  >
                    Reset Current Points
                  </button>
                  <button
                    type="button"
                    className="btn btn-compact"
                    onClick={() => zoneEditor.deleteLastInActiveMode()}
                  >
                    Delete Last in Mode
                  </button>
                  <button
                    type="button"
                    className="btn btn-compact"
                    disabled={!zoneEditor.canUndo}
                    onClick={() => zoneEditor.undo()}
                  >
                    Undo
                  </button>
                  <button
                    type="button"
                    className="btn btn-compact"
                    disabled={!zoneEditor.canRedo}
                    onClick={() => zoneEditor.redo()}
                  >
                    Redo
                  </button>
                </div>

                <div className="toolbar-actions">
                  <button
                    type="button"
                    className="btn btn-compact btn-danger"
                    onClick={() => zoneEditor.resetAllZones()}
                  >
                    Clear All
                  </button>
                  <button
                    type="button"
                    className="btn btn-compact btn-active"
                    disabled={updateZonesMutation.isPending}
                    onClick={handleSaveZones}
                  >
                    {updateZonesMutation.isPending ? 'Saving...' : 'Save & Sync Zones'}
                  </button>
                </div>
              </div>
            </div>
          </section>

          {/* Right Column: Zone Coordinates Inspector & Sync Status */}
          <aside className="card card-sidebar" aria-labelledby="zone-inspector-title">
            <div className="card-header">
              <span id="zone-inspector-title">Zone Geometry Inspector</span>
              <span className="badge badge-standby">
                v{currentCamera?.config?.version ?? 1}
              </span>
            </div>

            <div className="filter-bar" style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
              Click on the frame to add polygon vertices (minimum 3 points) or place 25x25px HSV traffic light sampling windows. Click the first vertex or &ldquo;Complete Polygon&rdquo; to close a zone.
            </div>

            <div className="evidence-feed" style={{ padding: 'var(--space-md)' }}>
              {zoneSyncBanner && (
                <div
                  style={{
                    padding: '0.6rem 0.75rem',
                    borderRadius: 'var(--radius-sm)',
                    background: 'var(--primary-soft)',
                    border: '1px solid var(--primary-border)',
                    color: 'var(--primary-text)',
                    fontSize: '0.8rem',
                  }}
                >
                  {zoneSyncBanner}
                </div>
              )}

              <div>
                <div className="zone-section-title">
                  Lanes ({zoneEditor.geometry.lanes.length}) — Pre-Intersection Entry Zones
                </div>
                <div style={{ display: 'grid', gap: '0.4rem' }}>
                  {zoneEditor.geometry.lanes.length === 0 ? (
                    <div className="data-row" style={{ color: 'var(--text-muted)' }}>
                      <span>No lane polygons configured.</span>
                    </div>
                  ) : (
                    zoneEditor.geometry.lanes.map((lane, idx) => (
                      <div key={idx} className="data-row">
                        <div>
                          <span
                            className="color-dot"
                            style={{ background: '#eab308', marginInlineEnd: '0.45rem' }}
                          />
                          <strong>Lane {idx + 1}</strong> ({lane.length} vertices)
                        </div>
                        <button
                          type="button"
                          className="btn btn-compact btn-danger"
                          onClick={() => zoneEditor.deleteLane(idx)}
                        >
                          Remove
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div>
                <div className="zone-section-title">
                  Intersection Polygon — Violation Trigger Zone
                </div>
                {zoneEditor.geometry.intersection.length >= 3 ? (
                  <div className="data-row">
                    <div>
                      <span
                        className="color-dot"
                        style={{ background: '#3b82f6', marginInlineEnd: '0.45rem' }}
                      />
                      <strong>Intersection</strong> ({zoneEditor.geometry.intersection.length}{' '}
                      vertices)
                    </div>
                    <button
                      type="button"
                      className="btn btn-compact btn-danger"
                      onClick={() => zoneEditor.clearIntersection()}
                    >
                      Clear
                    </button>
                  </div>
                ) : (
                  <div className="data-row" style={{ color: 'var(--text-muted)' }}>
                    <span>No intersection polygon configured.</span>
                  </div>
                )}
              </div>

              <div>
                <div className="zone-section-title">
                  Traffic Light Sampling Points ({zoneEditor.geometry.lightBoxes.length})
                </div>
                <div style={{ display: 'grid', gap: '0.4rem' }}>
                  {zoneEditor.geometry.lightBoxes.length === 0 ? (
                    <div className="data-row" style={{ color: 'var(--text-muted)' }}>
                      <span>No traffic light points configured.</span>
                    </div>
                  ) : (
                    zoneEditor.geometry.lightBoxes.map((lb, idx) => (
                      <div key={idx} className="data-row">
                        <div>
                          <span
                            className="color-dot"
                            style={{
                              background: lb.color === 'green' ? '#22c55e' : '#ef4444',
                              marginInlineEnd: '0.45rem',
                            }}
                          />
                          <strong style={{ textTransform: 'uppercase' }}>
                            {lb.color ?? 'red'} Light
                          </strong>{' '}
                          — ({lb.x}, {lb.y})
                        </div>
                        <button
                          type="button"
                          className="btn btn-compact btn-danger"
                          onClick={() => zoneEditor.deleteLightBox(idx)}
                        >
                          Remove
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </aside>
        </main>
      )}

      {activeTab === 'analytics' && (
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
                <span>Registered Camera Fleet</span>
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
                      <div className="toolbar-actions">
                        {auth.isAdmin && (
                          <button
                            type="button"
                            className="btn btn-compact"
                            onClick={() => {
                              stream.setSelectedCamera(cam.id);
                              setActiveTab('zones');
                            }}
                          >
                            Edit Zones
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
                {(statsQuery.data?.byVehicleClass ?? []).length === 0 ? (
                  <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                    No vehicle class violation records found.
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

      {/* Seamless Video & Snapshot Evidence Player Modal */}
      <dialog
        ref={evidenceDialogRef}
        {...({ closedby: 'any' } as any)}
        className="app-dialog"
        aria-labelledby="evidence-dialog-title"
        onClose={() => setActiveEvidence(null)}
      >
        <div className="dialog-header">
          <span id="evidence-dialog-title">
            {activeViolation
              ? `Violation Evidence — Track #${activeViolation.trackId} (${activeViolation.vehicleClass}) • Frame ${activeViolation.frameNumber}`
              : 'Violation Evidence'}
          </span>
          <form method="dialog">
            <button type="submit" className="btn btn-compact">
              Close
            </button>
          </form>
        </div>

        {activeViolation && activeEvidence && (
          <div className="dialog-body">
            <div
              className="toolbar-actions"
              style={{ justifyContent: 'space-between', width: '100%' }}
            >
              <div className="toolbar-actions">
                <button
                  type="button"
                  className={`btn btn-compact ${
                    activeEvidence.mediaTab === 'video' ? 'btn-active' : ''
                  }`}
                  onClick={() =>
                    setActiveEvidence({ violation: activeViolation, mediaTab: 'video' })
                  }
                >
                  Video Evidence Stream
                </button>
                <button
                  type="button"
                  className={`btn btn-compact ${
                    activeEvidence.mediaTab === 'snapshot' ? 'btn-active' : ''
                  }`}
                  onClick={() =>
                    setActiveEvidence({ violation: activeViolation, mediaTab: 'snapshot' })
                  }
                >
                  Annotated Snapshot
                </button>
              </div>

              <div className="toolbar-actions">
                {activeViolation.status === 'PENDING_REVIEW' && (
                  <>
                    <button
                      type="button"
                      className="btn btn-compact btn-danger"
                      onClick={() =>
                        reviewMutation.mutate({
                          id: activeViolation.id,
                          payload: { status: 'CONFIRMED' },
                        })
                      }
                    >
                      Confirm Violation
                    </button>
                    <button
                      type="button"
                      className="btn btn-compact"
                      onClick={() =>
                        reviewMutation.mutate({
                          id: activeViolation.id,
                          payload: { status: 'DISMISSED' },
                        })
                      }
                    >
                      Dismiss
                    </button>
                  </>
                )}
                {activeDownloadUrl && (
                  <a href={activeDownloadUrl} download className="btn btn-compact">
                    Download MP4
                  </a>
                )}
                {activeSnapshotUrl && (
                  <a href={activeSnapshotUrl} download className="btn btn-compact">
                    Download JPG
                  </a>
                )}
              </div>
            </div>

            <div className="evidence-player-frame">
              {activeEvidence.mediaTab === 'video' ? (
                <video
                  key={activeStreamUrl}
                  src={activeStreamUrl}
                  poster={activeSnapshotUrl || undefined}
                  controls
                  autoPlay
                  playsInline
                  preload="metadata"
                />
              ) : (
                <img
                  src={activeSnapshotUrl}
                  alt={`Snapshot for Violation #${activeViolation.trackId}`}
                />
              )}
            </div>
          </div>
        )}
      </dialog>
    </>
  );
}
