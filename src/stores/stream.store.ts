import { create } from 'zustand';
import { env } from '../config/env';
import {
  FrameTelemetry,
  StreamConnectionStatus,
  LiveFrameMessage,
  CameraStatusMessage,
  ConnectionEstablishedMessage,
} from '../types/websocket.types';

interface StreamStoreState {
  selectedCameraId: string;
  activeCameras: string[];
  connectionStatus: StreamConnectionStatus;
  latestFrameImage: string | null;
  telemetry: FrameTelemetry;
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
  handleCameraStatus: (msg: CameraStatusMessage) => void;
  handleConnectionEstablished: (msg: ConnectionEstablishedMessage) => void;
  resetStream: () => void;
}

export const useStreamStore = create<StreamStoreState>((set, get) => ({
  selectedCameraId: env.defaultCameraId,
  activeCameras: [],
  connectionStatus: 'disconnected',
  latestFrameImage: null,
  telemetry: {
    vehicle_count: 0,
    total_tracked: 0,
    violations_count: 0,
    fps: 0,
    light_state: 'unknown',
  },
  streamFps: 0,
  isPaused: false,
  lastFrameTimestamp: 0,

  setSelectedCamera: (cameraId: string) => {
    if (get().selectedCameraId !== cameraId) {
      set({
        selectedCameraId: cameraId,
        latestFrameImage: null,
        telemetry: {
          vehicle_count: 0,
          total_tracked: 0,
          violations_count: 0,
          fps: 0,
          light_state: 'unknown',
        },
      });
    }
  },

  setConnectionStatus: (status: StreamConnectionStatus) => {
    set({ connectionStatus: status });
  },

  togglePause: () => set((state) => ({ isPaused: !state.isPaused })),
  setPaused: (paused: boolean) => set({ isPaused: paused }),
  setStreamFps: (fps: number) => set({ streamFps: fps }),

  handleLiveFrame: (msg: LiveFrameMessage) => {
    const { selectedCameraId, isPaused } = get();

    // Only process frames matching the currently active/selected camera
    if (msg.cameraId === selectedCameraId && !isPaused) {
      set({
        latestFrameImage: msg.image,
        telemetry: msg.telemetry || {},
        lastFrameTimestamp: msg.timestamp || Date.now(),
        streamFps: msg.telemetry?.fps ?? get().streamFps,
      });
    }
  },

  handleCameraStatus: (msg: CameraStatusMessage) => {
    set((state) => {
      const activeSet = new Set(state.activeCameras);
      if (msg.status === 'ONLINE') {
        activeSet.add(msg.cameraId);
      } else {
        activeSet.delete(msg.cameraId);
      }
      return { activeCameras: Array.from(activeSet) };
    });
  },

  handleConnectionEstablished: (msg: ConnectionEstablishedMessage) => {
    set({
      activeCameras: msg.activeCameras || [],
    });
  },

  resetStream: () => {
    set({
      latestFrameImage: null,
      telemetry: {
        vehicle_count: 0,
        total_tracked: 0,
        violations_count: 0,
        fps: 0,
        light_state: 'unknown',
      },
    });
  },
}));

