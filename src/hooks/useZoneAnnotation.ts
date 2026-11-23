import { useCallback, useEffect, useRef, useState } from 'react';
import { vdatWsClient } from '../websocket/client';
import { useZoneEditor } from './useZoneEditor';
import { useUpdateZones } from './useUpdateZones';
import type { useLiveStream } from './useLiveStream';
import type { CameraChannelState, useMultiCameraTransmitter } from './useMultiCameraTransmitter';
import type { Camera, TrafficLightSamplingBox } from '../types/camera.types';

type LiveStream = ReturnType<typeof useLiveStream>;
type Transmitters = ReturnType<typeof useMultiCameraTransmitter>;

interface UseZoneAnnotationParams {
  focusedCameraId: string;
  stream: LiveStream;
  transmitters: Transmitters;
  cameras?: Camera[];
  setActiveTab: (tab: 'monitor' | 'analytics') => void;
}

export function useZoneAnnotation({
  focusedCameraId,
  stream,
  transmitters,
  cameras,
  setActiveTab,
}: UseZoneAnnotationParams) {
  const zoneEditor = useZoneEditor();
  const updateZonesMutation = useUpdateZones();

  const [isAnnotatingZones, setIsAnnotatingZones] = useState(false);
  const [editorSnapshotUrl, setEditorSnapshotUrl] = useState<string | null>(null);
  const editorSnapshotBlobUrlRef = useRef<string | null>(null);
  const [zoneSyncBanner, setZoneSyncBanner] = useState<string | null>(null);

  const initializedCameraConfigRef = useRef<string | null>(null);
  const initializedCameraSourceRef = useRef<string | null>(null);

  const currentCamera = cameras?.find((c) => c.id === focusedCameraId) ?? cameras?.[0];

  const revokeEditorSnapshotBlobUrl = useCallback(() => {
    if (editorSnapshotBlobUrlRef.current) {
      try {
        URL.revokeObjectURL(editorSnapshotBlobUrlRef.current);
      } catch {
        // Ignore already-revoked URLs
      }
      editorSnapshotBlobUrlRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      revokeEditorSnapshotBlobUrl();
    };
  }, [revokeEditorSnapshotBlobUrl]);

  const captureAnnotationFrame = useCallback(
    (camId: string): string | null => {
      const localSnap = transmitters.getChannelSnapshot(camId);
      if (localSnap) return localSnap;

      const latestBlob = vdatWsClient.getLatestFrameBlob(camId);
      if (latestBlob) {
        revokeEditorSnapshotBlobUrl();
        const url = URL.createObjectURL(latestBlob);
        editorSnapshotBlobUrlRef.current = url;
        return url;
      }

      return stream.cameraPreviews[camId] || null;
    },
    [revokeEditorSnapshotBlobUrl, stream.cameraPreviews, transmitters]
  );

  // Sync in-place Zone Editor state cleanly when focused camera or active ZoneProfile changes
  useEffect(() => {
    if (!currentCamera) return;
    const cfg = currentCamera.config;
    const effectiveSourceKey = cfg?.sourceKey ?? currentCamera.activeSourceKey ?? 'none';
    const sourceSessionKey = `${currentCamera.id}-${effectiveSourceKey}`;
    const configKey = `${sourceSessionKey}-v${cfg?.version ?? 0}`;

    // Preserve active in-place edits if camerasQuery refetches in the background for the same source
    if (isAnnotatingZones && initializedCameraSourceRef.current === sourceSessionKey) {
      return;
    }
    if (initializedCameraConfigRef.current === configKey) return;

    initializedCameraSourceRef.current = sourceSessionKey;
    initializedCameraConfigRef.current = configKey;

    if (!cfg) {
      zoneEditor.loadGeometry({
        lanes: [],
        intersection: [],
        exitZones: [],
        lightBoxes: [],
        crossingMode: false,
        clearanceSeconds: 0,
      });
      return;
    }

    const rawLightBox = cfg.lightBox;
    const lightBoxes: TrafficLightSamplingBox[] = Array.isArray(rawLightBox)
      ? (rawLightBox as TrafficLightSamplingBox[])
      : [];

    zoneEditor.loadGeometry({
      lanes: Array.isArray(cfg.lanes) ? cfg.lanes : [],
      intersection: Array.isArray(cfg.intersection) ? cfg.intersection : [],
      exitZones: Array.isArray(cfg.exitZones) ? cfg.exitZones : [],
      lightBoxes,
      crossingMode: Boolean(cfg.crossingMode),
      clearanceSeconds: typeof cfg.clearanceSeconds === 'number' ? cfg.clearanceSeconds : 0,
    });
  }, [currentCamera, isAnnotatingZones, zoneEditor]);

  // Press Escape while annotating to cancel the current in-progress polygon
  useEffect(() => {
    if (!isAnnotatingZones) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (document.querySelector('dialog[open]')) {
        return;
      }
      if (zoneEditor.activeDrawingPoints.length > 0) {
        event.preventDefault();
        zoneEditor.cancelDrawing();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isAnnotatingZones, zoneEditor]);

  // Capture a clean frame automatically when annotating (webcam <video> or AI-hosted binary stream)
  const focusedChannelTransmitted = transmitters.getChannel(focusedCameraId).transmittedFrames;
  const focusedPreview = stream.cameraPreviews[focusedCameraId];
  useEffect(() => {
    if (!isAnnotatingZones) return;

    if (!editorSnapshotUrl) {
      const snap = captureAnnotationFrame(focusedCameraId);
      if (snap) setEditorSnapshotUrl(snap);
    }

    // Stay subscribed while annotating so incoming binary frames don't wait for another render
    const unsubRaw = vdatWsClient.onRawLiveFrame((pkt) => {
      if (pkt.cameraId !== focusedCameraId) return;
      setEditorSnapshotUrl((curr) => {
        if (curr) return curr;
        revokeEditorSnapshotBlobUrl();
        const url = URL.createObjectURL(pkt.blob);
        editorSnapshotBlobUrlRef.current = url;
        return url;
      });
    });

    return unsubRaw;
  }, [
    isAnnotatingZones,
    editorSnapshotUrl,
    focusedChannelTransmitted,
    focusedCameraId,
    focusedPreview,
    captureAnnotationFrame,
    revokeEditorSnapshotBlobUrl,
  ]);

  const exitAnnotation = useCallback(() => {
    setIsAnnotatingZones(false);
    setEditorSnapshotUrl(null);
    revokeEditorSnapshotBlobUrl();
    zoneEditor.cancelDrawing();
  }, [revokeEditorSnapshotBlobUrl, zoneEditor]);

  const toggleAnnotationMode = useCallback(
    (targetCameraId?: string, forceOpen?: boolean) => {
      const camId = targetCameraId || focusedCameraId;
      if (camId !== focusedCameraId) {
        initializedCameraConfigRef.current = null;
        initializedCameraSourceRef.current = null;
        stream.setSelectedCamera(camId);
      }
      const nextOpen = forceOpen !== undefined ? forceOpen : !isAnnotatingZones;
      setZoneSyncBanner(null);
      if (nextOpen) {
        setEditorSnapshotUrl(captureAnnotationFrame(camId));
      } else {
        setEditorSnapshotUrl(null);
        revokeEditorSnapshotBlobUrl();
        zoneEditor.cancelDrawing();
      }
      setIsAnnotatingZones(nextOpen);
      setActiveTab('monitor');
    },
    [
      captureAnnotationFrame,
      focusedCameraId,
      isAnnotatingZones,
      revokeEditorSnapshotBlobUrl,
      setActiveTab,
      stream,
      zoneEditor,
    ]
  );

  const grabFrame = useCallback(() => {
    const snap = captureAnnotationFrame(focusedCameraId);
    if (snap) setEditorSnapshotUrl(snap);
  }, [captureAnnotationFrame, focusedCameraId]);

  const clearSnapshot = useCallback(() => {
    setEditorSnapshotUrl(null);
    revokeEditorSnapshotBlobUrl();
  }, [revokeEditorSnapshotBlobUrl]);

  const saveZones = useCallback(
    async (focusedChannel: CameraChannelState) => {
      const targetCameraId = focusedCameraId || currentCamera?.id || 'cam-01';
      setZoneSyncBanner(null);

      let nextLanes = zoneEditor.geometry.lanes;
      let nextIntersection = zoneEditor.geometry.intersection;
      let nextExitZones = zoneEditor.geometry.exitZones;
      if (zoneEditor.activeDrawingPoints.length >= 3) {
        const committedPolygon = [...zoneEditor.activeDrawingPoints];
        if (zoneEditor.mode === 'draw_lane') {
          nextLanes = [...nextLanes, committedPolygon];
        } else if (zoneEditor.mode === 'draw_intersection') {
          nextIntersection = committedPolygon;
        } else if (zoneEditor.mode === 'draw_exit_zone') {
          nextExitZones = [...nextExitZones, committedPolygon];
        }
        zoneEditor.finishDrawing();
      }

      const activeSourceKey = focusedChannel.isBroadcasting
        ? focusedChannel.sourceKey
        : currentCamera?.id === targetCameraId
          ? currentCamera?.activeSourceKey || currentCamera?.config?.sourceKey || `camera:${targetCameraId}`
          : `camera:${targetCameraId}`;

      try {
        const response = await updateZonesMutation.mutateAsync({
          cameraId: targetCameraId,
          payload: {
            sourceKey: activeSourceKey,
            lanes: nextLanes,
            intersection: nextIntersection,
            exitZones: nextExitZones,
            lightBox: zoneEditor.geometry.lightBoxes,
            crossingMode: zoneEditor.geometry.crossingMode,
            clearanceSeconds: zoneEditor.geometry.clearanceSeconds,
          },
        });
        setZoneSyncBanner(response.message);
        exitAnnotation();
      } catch (err: any) {
        setZoneSyncBanner(err.message || 'Failed to save zone profile.');
      }
    },
    [currentCamera, exitAnnotation, focusedCameraId, updateZonesMutation, zoneEditor]
  );

  return {
    zoneEditor,
    isAnnotatingZones,
    editorSnapshotUrl,
    clearSnapshot,
    zoneSyncBanner,
    currentCamera,
    isSaving: updateZonesMutation.isPending,
    toggleAnnotationMode,
    exitAnnotation,
    grabFrame,
    saveZones,
  };
}
