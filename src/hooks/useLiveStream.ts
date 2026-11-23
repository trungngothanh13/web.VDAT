import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useShallow } from 'zustand/react/shallow';
import { vdatWsClient } from '../websocket/client';
import { useStreamStore } from '../stores/stream.store';
import { CAMERAS_QUERY_KEY } from './useCameras';

export function useLiveStream(autoConnect: boolean = true) {
  const queryClient = useQueryClient();
  const state = useStreamStore(
    useShallow((s) => ({
      selectedCameraId: s.selectedCameraId,
      activeCameras: s.activeCameras,
      modelStatus: s.modelStatus,
      trackerStatus: s.trackerStatus,
      connectionStatus: s.connectionStatus,
      cameraPreviews: s.cameraPreviews,
      bypassZonesByCamera: s.bypassZonesByCamera,
      isPaused: s.isPaused,
    }))
  );

  useEffect(() => {
    if (!autoConnect) return;
    const store = useStreamStore.getState();

    vdatWsClient.connect();

    const unsubscribers = [
      vdatWsClient.onStatusChange((status) => store.setConnectionStatus(status)),
      vdatWsClient.onCameraPreview((msg) => store.handleCameraPreview(msg)),
      vdatWsClient.onCameraBypassZonesStatus((msg) => store.handleCameraBypassZonesStatus(msg)),
      vdatWsClient.onCameraSourceStatus((msg) => store.handleCameraSourceStatus(msg)),
      vdatWsClient.onCameraTelemetry((msg) => store.handleCameraTelemetry(msg)),
      vdatWsClient.onCameraStatus((msg) => store.handleCameraStatus(msg)),
      vdatWsClient.onAiModelStatus((msg) => store.handleAiModelStatus(msg)),
      vdatWsClient.onAiTrackerStatus((msg) => store.handleAiTrackerStatus(msg)),
      vdatWsClient.onConnectionEstablished((msg) => store.handleConnectionEstablished(msg)),
      vdatWsClient.onCameraProfileSwitched(() => {
        void queryClient.invalidateQueries({ queryKey: [CAMERAS_QUERY_KEY] });
      }),
    ];

    // Periodically ask AI engine for fresh lightweight minicam thumbnails once every 60s
    const previewTimer = setInterval(() => {
      vdatWsClient.sendPayload({ type: 'request_camera_previews' });
    }, 60000);

    return () => {
      clearInterval(previewTimer);
      for (const unsub of unsubscribers) {
        unsub();
      }
    };
  }, [autoConnect, queryClient]);

  const actions = useStreamStore.getState();

  return {
    ...state,
    isConnected: state.connectionStatus === 'connected',
    isCameraLive: state.activeCameras.includes(state.selectedCameraId),
    setSelectedCamera: actions.setSelectedCamera,
    switchAiModel: actions.switchAiModel,
    switchAiTracker: actions.switchAiTracker,
    setCameraBypassZones: actions.setCameraBypassZones,
    togglePause: actions.togglePause,
  };
}
