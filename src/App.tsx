import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  useAuth,
  useLiveStream,
  useViolationAlerts,
  useViolations,
  useReviewViolation,
  useOverviewStats,
  useCameras,
  useAudioAlert,
  useMultiCameraTransmitter,
  useZoneAnnotation,
} from './hooks';
import { DEFAULT_CAMERA_SLOTS } from './config/constants';
import { LoginScreen } from './components/auth/LoginScreen';
import { AppHeader } from './components/layout/AppHeader';
import { FocusedStreamCard } from './components/monitor/FocusedStreamCard';
import { CameraWall } from './components/monitor/CameraWall';
import { ZoneAnnotationPanel } from './components/monitor/ZoneAnnotationPanel';
import { ViolationEvidencePanel } from './components/monitor/ViolationEvidencePanel';
import { AnalyticsView } from './components/analytics/AnalyticsView';
import { EvidenceDialog, type ActiveEvidenceState } from './components/dialogs/EvidenceDialog';
import type { Violation, ViolationStatus } from './types/violation.types';
import './styles/dashboard.css';

export function App() {
  const auth = useAuth();

  const [activeTab, setActiveTab] = useState<'monitor' | 'analytics'>('monitor');
  const [statusFilter, setStatusFilter] = useState<ViolationStatus | undefined>(undefined);
  const [cameraFilter, setCameraFilter] = useState<string | undefined>(undefined);
  const [activeEvidence, setActiveEvidence] = useState<ActiveEvidenceState | null>(null);

  const stream = useLiveStream(auth.isAuthenticated);
  const transmitters = useMultiCameraTransmitter();
  const focusedCameraId = stream.selectedCameraId || 'cam-01';
  const focusedChannel = transmitters.getChannel(focusedCameraId);
  const alerts = useViolationAlerts();
  const audio = useAudioAlert();

  // Auto-filter Violation Evidence sidebar to whichever camera the operator focuses on
  useEffect(() => {
    setCameraFilter(focusedCameraId);
  }, [focusedCameraId]);

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

  const annotation = useZoneAnnotation({
    focusedCameraId,
    stream,
    transmitters,
    cameras: camerasQuery.data,
    setActiveTab,
  });

  const storedViolations = violationsQuery.data?.data;
  const mergedViolations = useMemo(() => {
    const merged: Violation[] = [];
    const seenIds = new Set<string>();
    for (const v of [...alerts.liveAlerts, ...(storedViolations ?? [])]) {
      if (!seenIds.has(v.id)) {
        const matchesStatus = !statusFilter || v.status === statusFilter;
        const matchesCamera = !cameraFilter || v.cameraId === cameraFilter;
        if (matchesStatus && matchesCamera) {
          seenIds.add(v.id);
          merged.push(v);
        }
      }
    }
    return merged;
  }, [alerts.liveAlerts, storedViolations, statusFilter, cameraFilter]);

  const openEvidenceViewer = useCallback(
    (violation: Violation, preferredTab?: 'video' | 'snapshot') => {
      const hasClip = Boolean(violation.evidenceClipUrl);
      setActiveEvidence({
        violation,
        mediaTab: preferredTab ?? (hasClip ? 'video' : 'snapshot'),
      });
    },
    []
  );

  const handleReviewViolation = useCallback(
    (id: string, status: 'CONFIRMED' | 'DISMISSED') => {
      reviewMutation.mutate({ id, payload: { status } });
    },
    [reviewMutation]
  );

  const cameraSlots = camerasQuery.data ?? DEFAULT_CAMERA_SLOTS;

  const handleCamerasDeleted = useCallback(
    (idsToDelete: string[]) => {
      for (const camId of idsToDelete) {
        transmitters.stopBroadcast(camId);
      }
      if (idsToDelete.includes(focusedCameraId)) {
        const remaining = cameraSlots.filter((c) => !idsToDelete.includes(c.id));
        if (remaining.length > 0) {
          stream.setSelectedCamera(remaining[0].id);
        }
        annotation.exitAnnotation();
      }
    },
    [annotation, cameraSlots, focusedCameraId, stream, transmitters]
  );

  // Strict Authentication Gate: Unauthenticated visitors cannot view the dashboard
  if (!auth.isAuthenticated) {
    return <LoginScreen auth={auth} />;
  }

  const activeEvidenceState: ActiveEvidenceState | null = activeEvidence
    ? {
        ...activeEvidence,
        violation:
          mergedViolations.find((v) => v.id === activeEvidence.violation.id) ??
          activeEvidence.violation,
      }
    : null;

  return (
    <>
      <AppHeader
        auth={auth}
        activeTab={activeTab}
        onTabChange={setActiveTab}
        audio={audio}
      />

      {activeTab === 'monitor' && (
        <main className="workspace-grid">
          <div className="primary-column">
            <FocusedStreamCard
              auth={auth}
              stream={stream}
              focusedCameraId={focusedCameraId}
              focusedChannel={focusedChannel}
              transmitters={transmitters}
              annotation={annotation}
              cameraSlotIds={cameraSlots.map((c) => c.id)}
              fallbackViolationCount={mergedViolations.length}
            />

            <CameraWall
              auth={auth}
              cameraSlots={cameraSlots}
              stream={stream}
              transmitters={transmitters}
              focusedCameraId={focusedCameraId}
              onInspect={(camId) => {
                annotation.exitAnnotation();
                stream.setSelectedCamera(camId);
              }}
              onCamerasDeleted={handleCamerasDeleted}
            />
          </div>

          {annotation.isAnnotatingZones && auth.isAdmin ? (
            <ZoneAnnotationPanel
              annotation={annotation}
              focusedCameraId={focusedCameraId}
              focusedChannel={focusedChannel}
            />
          ) : (
            <ViolationEvidencePanel
              violations={mergedViolations}
              cameraSlots={cameraSlots}
              statusFilter={statusFilter}
              onStatusFilterChange={setStatusFilter}
              cameraFilter={cameraFilter}
              onCameraFilterChange={setCameraFilter}
              onOpenEvidence={openEvidenceViewer}
              onReview={handleReviewViolation}
            />
          )}
        </main>
      )}

      {activeTab === 'analytics' && (
        <AnalyticsView
          auth={auth}
          stats={statsQuery.data}
          cameras={camerasQuery.data}
          activeCameraCount={stream.activeCameras.length}
          fallbackTotal={mergedViolations.length}
          onAnnotate={(camId) => annotation.toggleAnnotationMode(camId, true)}
        />
      )}

      <EvidenceDialog
        evidence={activeEvidenceState}
        onTabChange={(mediaTab) =>
          setActiveEvidence((prev) => (prev ? { ...prev, mediaTab } : null))
        }
        onClose={() => setActiveEvidence(null)}
        onReview={handleReviewViolation}
      />
    </>
  );
}
