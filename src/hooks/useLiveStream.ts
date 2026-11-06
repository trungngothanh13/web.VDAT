import { useEffect, useRef } from 'react';
import { vdatWsClient } from '../websocket/client';
import { useStreamStore } from '../stores/stream.store';

export interface UseLiveStreamOptions {
  cameraId?: string;
  autoConnect?: boolean;
}

export function useLiveStream(options?: UseLiveStreamOptions) {
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

    // Subscribe to incoming live frames
    const unsubFrame = vdatWsClient.onLiveFrame((msg) => {
      store.handleLiveFrame(msg);
    });

    // Subscribe to camera status updates (online / offline)
    const unsubCamStatus = vdatWsClient.onCameraStatus((msg) => {
      store.handleCameraStatus(msg);
    });

    // Subscribe to connection established handshake
    const unsubConn = vdatWsClient.onConnectionEstablished((msg) => {
      store.handleConnectionEstablished(msg);
    });

    unsubscribeRefs.current = [unsubStatus, unsubFrame, unsubCamStatus, unsubConn];

    return () => {
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
    connectionStatus: store.connectionStatus,
    isConnected: store.connectionStatus === 'connected',
    isCameraLive,
    latestFrameImage: store.latestFrameImage,
    telemetry: store.telemetry,
    streamFps: store.streamFps,
    isPaused: store.isPaused,
    lastFrameTimestamp: store.lastFrameTimestamp,
    setSelectedCamera: (id: string) => store.setSelectedCamera(id),
    togglePause: () => store.togglePause(),
    setPaused: (paused: boolean) => store.setPaused(paused),
    reconnect: () => vdatWsClient.reconnect(),
  };
}

