import { create } from 'zustand';
import { env } from '../config/env';
import { vdatWsClient } from '../websocket/client';
import {
  FrameTelemetry,
  StreamConnectionStatus,
  LiveFrameMessage,
  CameraTelemetryMessage,
  CameraStatusMessage,
  ConnectionEstablishedMessage,
} from '../types/websocket.types';

const DEFAULT_TELEMETRY: FrameTelemetry = {
  vehicle_count: 0,
  total_tracked: 0,
  violations_count: 0,
  fps: 0,
  light_state: 'unknown',
};

interface StreamStoreState {
  selectedCameraId: string;
  activeCameras: string[];
  connectionStatus: StreamConnectionStatus;
  latestFrameImage: string | null;
  latestFrameByCamera: Record<string, string>;
  telemetry: FrameTelemetry;
  telemetryByCamera: Record<string, FrameTelemetry>;
  streamFps: number;
  isPaused: boolean;
  lastFrameTimestamp: number;

  // Actions
  setSelectedCamera: (cameraId: string) => void;
  setConnectionStatus: (status: StreamConnectionStatus) => void;
  togglePause: () => void;
  setPaused: (paused: boolean) => void;
  setStreamFps: (fps: number) => void;

  // WebSocket message handlers
  handleLiveFrame: (msg: LiveFrameMessage) => void;
  handleCameraTelemetry: (msg: CameraTelemetryMessage) => void;
  handleCameraStatus: (msg: CameraStatusMessage) => void;
  handleConnectionEstablished: (msg: ConnectionEstablishedMessage) => void;
  resetStream: () => void;
}

export const useStreamStore = create<StreamStoreState>((set, get) => ({
  selectedCameraId: env.defaultCameraId,
  activeCameras: [],
  connectionStatus: 'disconnected',
  latestFrameImage: null,
  latestFrameByCamera: {},
  telemetry: { ...DEFAULT_TELEMETRY },
  telemetryByCamera: {},
  streamFps: 0,
  isPaused: false,
  lastFrameTimestamp: 0,

  setSelectedCamera: (cameraId: string) => {
    vdatWsClient.sendPayload({ type: 'watch_camera', cameraId });
    const { latestFrameByCamera, telemetryByCamera } = get();
    set({
      selectedCameraId: cameraId,
      latestFrameImage: latestFrameByCamera[cameraId] ?? null,
      telemetry: telemetryByCamera[cameraId] ?? { ...DEFAULT_TELEMETRY },
    });
  },

  setConnectionStatus: (status: StreamConnectionStatus) => {
    set({ connectionStatus: status });
  },

  togglePause: () => set((state) => ({ isPaused: !state.isPaused })),
  setPaused: (paused: boolean) => set({ isPaused: paused }),
  setStreamFps: (fps: number) => set({ streamFps: fps }),

  handleLiveFrame: (msg: LiveFrameMessage) => {
    const { selectedCameraId, isPaused, latestFrameByCamera, telemetryByCamera } = get();
    const updatedFrames = { ...latestFrameByCamera, [msg.cameraId]: msg.image };
    const updatedTelemetry = msg.telemetry
      ? { ...telemetryByCamera, [msg.cameraId]: msg.telemetry }
      : telemetryByCamera;

    if (msg.cameraId === selectedCameraId && !isPaused) {
      set({
        latestFrameByCamera: updatedFrames,
        telemetryByCamera: updatedTelemetry,
        latestFrameImage: msg.image,
        telemetry: msg.telemetry || { ...DEFAULT_TELEMETRY },
        lastFrameTimestamp: msg.timestamp || Date.now(),
        streamFps: msg.telemetry?.fps ?? get().streamFps,
      });
    } else {
      set({
        latestFrameByCamera: updatedFrames,
        telemetryByCamera: updatedTelemetry,
      });
    }
  },

  handleCameraTelemetry: (msg: CameraTelemetryMessage) => {
    if (!msg.telemetry) return;
    set((state) => {
      const updatedTelemetry = { ...state.telemetryByCamera, [msg.cameraId]: msg.telemetry };
      return {
        telemetryByCamera: updatedTelemetry,
        ...(msg.cameraId === state.selectedCameraId && !state.isPaused
          ? {
              telemetry: msg.telemetry,
              streamFps: msg.telemetry.fps ?? state.streamFps,
            }
          : {}),
      };
    });
  },

  handleCameraStatus: (msg: CameraStatusMessage) => {
    set((state) => {
      const activeSet = new Set(state.activeCameras);
      if (msg.status === 'ONLINE') {
        activeSet.add(msg.cameraId);
        return { activeCameras: Array.from(activeSet) };
      } else {
        activeSet.delete(msg.cameraId);
        const updatedFrames = { ...state.latestFrameByCamera };
        delete updatedFrames[msg.cameraId];
        const isCurrentCam = msg.cameraId === state.selectedCameraId;
        return {
          activeCameras: Array.from(activeSet),
          latestFrameByCamera: updatedFrames,
          ...(isCurrentCam
            ? {
                latestFrameImage: null,
                telemetry: { ...DEFAULT_TELEMETRY },
              }
            : {}),
        };
      }
    });
  },

  handleConnectionEstablished: (msg: ConnectionEstablishedMessage) => {
    const selectedCameraId = get().selectedCameraId;
    vdatWsClient.sendPayload({ type: 'watch_camera', cameraId: selectedCameraId });
    set({
      activeCameras: msg.activeCameras || [],
    });
  },

  resetStream: () => {
    set({
      latestFrameImage: null,
      latestFrameByCamera: {},
      telemetry: { ...DEFAULT_TELEMETRY },
      telemetryByCamera: {},
    });
  },
}));

