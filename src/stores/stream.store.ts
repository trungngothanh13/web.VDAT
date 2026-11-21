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

const UNFOCUSED_TELEMETRY_THROTTLE_MS = 250;
const lastTelemetryUpdateAt: Record<string, number> = {};

function normalizeFrameSrc(image: string): string {
  if (image.startsWith('blob:') || image.startsWith('data:')) {
    return image;
  }
  return `data:image/jpeg;base64,${image}`;
}

function revokeBlobUrlSoon(url?: string | null): void {
  if (url && url.startsWith('blob:')) {
    setTimeout(() => {
      try {
        URL.revokeObjectURL(url);
      } catch {
        // Ignore already-revoked URLs
      }
    }, 250);
  }
}

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
    const nextSrc = normalizeFrameSrc(msg.image);
    const prevSrc = latestFrameByCamera[msg.cameraId];
    if (prevSrc && prevSrc !== nextSrc) {
      revokeBlobUrlSoon(prevSrc);
    }

    const updatedFrames = { ...latestFrameByCamera, [msg.cameraId]: nextSrc };
    const updatedTelemetry = msg.telemetry
      ? { ...telemetryByCamera, [msg.cameraId]: msg.telemetry }
      : telemetryByCamera;

    if (msg.cameraId === selectedCameraId && !isPaused) {
      set({
        latestFrameByCamera: updatedFrames,
        telemetryByCamera: updatedTelemetry,
        latestFrameImage: nextSrc,
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
    const state = get();
    const isFocused = msg.cameraId === state.selectedCameraId;
    const prevTel = state.telemetryByCamera[msg.cameraId];
    const now = Date.now();

    // Throttle unfocused wall telemetry updates so 6 cameras don't trigger 90 full React renders/sec
    if (
      !isFocused &&
      prevTel &&
      prevTel.violations_count === msg.telemetry.violations_count &&
      prevTel.light_state === msg.telemetry.light_state &&
      now - (lastTelemetryUpdateAt[msg.cameraId] ?? 0) < UNFOCUSED_TELEMETRY_THROTTLE_MS
    ) {
      return;
    }
    lastTelemetryUpdateAt[msg.cameraId] = now;

    set((curr) => {
      const updatedTelemetry = { ...curr.telemetryByCamera, [msg.cameraId]: msg.telemetry };
      return {
        telemetryByCamera: updatedTelemetry,
        ...(msg.cameraId === curr.selectedCameraId && !curr.isPaused
          ? {
              telemetry: msg.telemetry,
              streamFps: msg.telemetry.fps ?? curr.streamFps,
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
        revokeBlobUrlSoon(updatedFrames[msg.cameraId]);
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
    const prevFrames = get().latestFrameByCamera;
    for (const url of Object.values(prevFrames)) {
      revokeBlobUrlSoon(url);
    }
    set({
      latestFrameImage: null,
      latestFrameByCamera: {},
      telemetry: { ...DEFAULT_TELEMETRY },
      telemetryByCamera: {},
    });
  },
}));

