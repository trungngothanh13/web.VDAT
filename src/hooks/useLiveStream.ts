import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { vdatWsClient } from '../websocket/client';
import { useStreamStore } from '../stores/stream.store';
import { CAMERAS_QUERY_KEY } from './useCameras';

export interface UseLiveStreamOptions {
  cameraId?: string;
  autoConnect?: boolean;
}

export function useLiveStream(options?: UseLiveStreamOptions) {
  const queryClient = useQueryClient();
  const store = useStreamStore();
  const optionsCameraId = options?.cameraId;
  const autoConnect = options?.autoConnect ?? true;

  const unsubscribeRefs = useRef<Array<() => void>>([]);

  // Sync selected camera if passed in options
  useEffect(() => {
    if (optionsCameraId && optionsCameraId !== store.selectedCameraId) {
      store.setSelectedCamera(optionsCameraId);
    }
  }, [optionsCameraId]);

  // Connect to WebSocket and subscribe to streaming events
  useEffect(() => {
    if (!autoConnect) return;

    vdatWsClient.connect();

    // Subscribe to status updates
    const unsubStatus = vdatWsClient.onStatusChange((status) => {
      store.setConnectionStatus(status);
    });

    // Subscribe to incoming live frames, periodic minicam previews, and AI-hosted source status updates
    const unsubFrame = vdatWsClient.onLiveFrame((msg) => {
      store.handleLiveFrame(msg);
    });

    const unsubPreview = vdatWsClient.onCameraPreview((msg) => {
      store.handleCameraPreview(msg);
    });

    const unsubSourceStatus = vdatWsClient.onCameraSourceStatus((msg) => {
      store.handleCameraSourceStatus(msg);
    });

    // Subscribe to lightweight telemetry for all cameras
    const unsubTelemetry = vdatWsClient.onCameraTelemetry((msg) => {
      store.handleCameraTelemetry(msg);
    });

    // Subscribe to camera status updates (online / offline)
    const unsubCamStatus = vdatWsClient.onCameraStatus((msg) => {
      store.handleCameraStatus(msg);
    });

    // Subscribe to live AI model toggle updates (trained vs stock legacy)
    const unsubModelStatus = vdatWsClient.onAiModelStatus((msg) => {
      store.handleAiModelStatus(msg);
    });

    // Subscribe to live AI tracker toggle updates (bytetrack / botsort / deepsort)
    const unsubTrackerStatus = vdatWsClient.onAiTrackerStatus((msg) => {
      store.handleAiTrackerStatus(msg);
    });

    // Subscribe to connection established handshake
    const unsubConn = vdatWsClient.onConnectionEstablished((msg) => {
      store.handleConnectionEstablished(msg);
    });

    // Refresh camera profile configs when a slot auto-binds to a new source
    const unsubProfile = vdatWsClient.onCameraProfileSwitched(() => {
      void queryClient.invalidateQueries({ queryKey: [CAMERAS_QUERY_KEY] });
    });

    unsubscribeRefs.current = [
      unsubStatus,
      unsubFrame,
      unsubPreview,
      unsubSourceStatus,
      unsubTelemetry,
      unsubCamStatus,
      unsubModelStatus,
      unsubTrackerStatus,
      unsubConn,
      unsubProfile,
    ];

    // Periodically ask AI engine for fresh lightweight minicam thumbnails once every 60s
    const previewTimer = setInterval(() => {
      vdatWsClient.sendPayload({ type: 'request_camera_previews' });
    }, 60000);

    return () => {
      clearInterval(previewTimer);
      for (const unsub of unsubscribeRefs.current) {
        unsub();
      }
      unsubscribeRefs.current = [];
    };
  }, [autoConnect]);

  const isCameraLive = store.activeCameras.includes(store.selectedCameraId);

  return {
    selectedCameraId: store.selectedCameraId,
    activeCameras: store.activeCameras,
    modelStatus: store.modelStatus,
    trackerStatus: store.trackerStatus,
    connectionStatus: store.connectionStatus,
    isConnected: store.connectionStatus === 'connected',
    isCameraLive,
    latestFrameImage: store.latestFrameImage,
    latestFrameByCamera: store.latestFrameByCamera,
    cameraPreviews: store.cameraPreviews,
    telemetry: store.telemetry,
    telemetryByCamera: store.telemetryByCamera,
    streamFps: store.streamFps,
    isPaused: store.isPaused,
    lastFrameTimestamp: store.lastFrameTimestamp,
    setSelectedCamera: (id: string) => store.setSelectedCamera(id),
    switchAiModel: (profile: 'trained' | 'stock') => store.switchAiModel(profile),
    switchAiTracker: (tracker: 'bytetrack' | 'botsort' | 'deepsort') =>
      store.switchAiTracker(tracker),
    togglePause: () => store.togglePause(),
    setPaused: (paused: boolean) => store.setPaused(paused),
    reconnect: () => vdatWsClient.reconnect(),
  };
}

