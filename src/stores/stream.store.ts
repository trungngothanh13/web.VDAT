import { create } from 'zustand';
import { env } from '../config/env';
import { vdatWsClient } from '../websocket/client';
import {
  FrameTelemetry,
  StreamConnectionStatus,
  LiveFrameMessage,
  LiveOverlayPayload,
  LiveOverlayMessage,
  CameraSourceStatusMessage,
  CameraTelemetryMessage,
  CameraStatusMessage,
  AiModelProfile,
  AiModelStatus,
  AiModelStatusMessage,
  AiTrackerType,
  AiTrackerStatus,
  AiTrackerStatusMessage,
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
  modelStatus: AiModelStatus;
  trackerStatus: AiTrackerStatus;
  connectionStatus: StreamConnectionStatus;
  latestFrameImage: string | null;
  latestFrameByCamera: Record<string, string>;
  latestOverlay: LiveOverlayPayload | null;
  latestOverlayByCamera: Record<string, LiveOverlayPayload | null>;
  telemetry: FrameTelemetry;
  telemetryByCamera: Record<string, FrameTelemetry>;
  streamFps: number;
  isPaused: boolean;
  lastFrameTimestamp: number;

  // Actions
  setSelectedCamera: (cameraId: string) => void;
  switchAiModel: (profile: AiModelProfile) => void;
  switchAiTracker: (tracker: AiTrackerType) => void;
  setConnectionStatus: (status: StreamConnectionStatus) => void;
  togglePause: () => void;
  setPaused: (paused: boolean) => void;
  setStreamFps: (fps: number) => void;

  // WebSocket message handlers
  handleLiveFrame: (msg: LiveFrameMessage) => void;
  handleLiveOverlay: (msg: LiveOverlayMessage) => void;
  handleCameraSourceStatus: (msg: CameraSourceStatusMessage) => void;
  handleCameraTelemetry: (msg: CameraTelemetryMessage) => void;
  handleCameraStatus: (msg: CameraStatusMessage) => void;
  handleAiModelStatus: (msg: AiModelStatusMessage) => void;
  handleAiTrackerStatus: (msg: AiTrackerStatusMessage) => void;
  handleConnectionEstablished: (msg: ConnectionEstablishedMessage) => void;
  resetStream: () => void;
}

export const useStreamStore = create<StreamStoreState>((set, get) => ({
  selectedCameraId: env.defaultCameraId,
  activeCameras: [],
  modelStatus: {
    profile: 'trained',
    modelName: 'best.pt',
    confidence: 0.45,
    switching: false,
  },
  trackerStatus: {
    tracker: 'bytetrack',
    switching: false,
  },
  connectionStatus: 'disconnected',
  latestFrameImage: null,
  latestFrameByCamera: {},
  latestOverlay: null,
  latestOverlayByCamera: {},
  telemetry: { ...DEFAULT_TELEMETRY },
  telemetryByCamera: {},
  streamFps: 0,
  isPaused: false,
  lastFrameTimestamp: 0,

  setSelectedCamera: (cameraId: string) => {
    vdatWsClient.sendPayload({ type: 'watch_camera', cameraId });
    const { latestFrameByCamera, latestOverlayByCamera, telemetryByCamera } = get();
    set({
      selectedCameraId: cameraId,
      latestFrameImage: latestFrameByCamera[cameraId] ?? null,
      latestOverlay: latestOverlayByCamera[cameraId] ?? null,
      telemetry: telemetryByCamera[cameraId] ?? { ...DEFAULT_TELEMETRY },
    });
  },

  switchAiModel: (profile: AiModelProfile) => {
    const curr = get().modelStatus;
    if (curr.switching || curr.profile === profile) return;
    if (vdatWsClient.sendPayload({ type: 'switch_ai_model', profile })) {
      set({
        modelStatus: {
          ...curr,
          switching: true,
        },
      });
    }
  },

  switchAiTracker: (tracker: AiTrackerType) => {
    const curr = get().trackerStatus;
    if (curr.switching || curr.tracker === tracker) return;
    if (vdatWsClient.sendPayload({ type: 'switch_ai_tracker', tracker })) {
      set({
        trackerStatus: {
          ...curr,
          switching: true,
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
    const { selectedCameraId, isPaused, latestFrameByCamera, latestOverlayByCamera, telemetryByCamera } = get();
    const nextSrc = normalizeFrameSrc(msg.image);
    const prevSrc = latestFrameByCamera[msg.cameraId];
    if (prevSrc && prevSrc !== nextSrc) {
      revokeBlobUrlSoon(prevSrc);
    }

    const updatedFrames = { ...latestFrameByCamera, [msg.cameraId]: nextSrc };
    const updatedOverlays = { ...latestOverlayByCamera, [msg.cameraId]: null };
    const updatedTelemetry = msg.telemetry
      ? { ...telemetryByCamera, [msg.cameraId]: msg.telemetry }
      : telemetryByCamera;

    if (msg.cameraId === selectedCameraId && !isPaused) {
      set({
        latestFrameByCamera: updatedFrames,
        latestOverlayByCamera: updatedOverlays,
        telemetryByCamera: updatedTelemetry,
        latestFrameImage: nextSrc,
        latestOverlay: null,
        telemetry: msg.telemetry || { ...DEFAULT_TELEMETRY },
        lastFrameTimestamp: msg.timestamp || Date.now(),
        streamFps: msg.telemetry?.fps ?? get().streamFps,
      });
    } else {
      set({
        latestFrameByCamera: updatedFrames,
        latestOverlayByCamera: updatedOverlays,
        telemetryByCamera: updatedTelemetry,
      });
    }
  },

  handleLiveOverlay: (msg: LiveOverlayMessage) => {
    const { selectedCameraId, isPaused, latestOverlayByCamera, telemetryByCamera } = get();
    const updatedOverlays = { ...latestOverlayByCamera, [msg.cameraId]: msg.overlay };
    const updatedTelemetry = msg.telemetry
      ? { ...telemetryByCamera, [msg.cameraId]: msg.telemetry }
      : telemetryByCamera;

    if (msg.cameraId === selectedCameraId && !isPaused) {
      set({
        latestOverlayByCamera: updatedOverlays,
        telemetryByCamera: updatedTelemetry,
        latestOverlay: msg.overlay,
        telemetry: msg.telemetry || { ...DEFAULT_TELEMETRY },
        lastFrameTimestamp: msg.timestamp || Date.now(),
        streamFps: msg.telemetry?.fps ?? get().streamFps,
      });
    } else {
      set({
        latestOverlayByCamera: updatedOverlays,
        telemetryByCamera: updatedTelemetry,
      });
    }
  },

  handleCameraSourceStatus: (msg: CameraSourceStatusMessage) => {
    if (msg.status !== 'stopped' && msg.status !== 'ended') return;
    set((state) => {
      const updatedFrames = { ...state.latestFrameByCamera };
      revokeBlobUrlSoon(updatedFrames[msg.cameraId]);
      delete updatedFrames[msg.cameraId];
      const updatedOverlays = { ...state.latestOverlayByCamera };
      delete updatedOverlays[msg.cameraId];
      const isFocused = msg.cameraId === state.selectedCameraId;
      return {
        latestFrameByCamera: updatedFrames,
        latestOverlayByCamera: updatedOverlays,
        ...(isFocused
          ? {
              latestFrameImage: null,
              latestOverlay: null,
              telemetry: { ...DEFAULT_TELEMETRY },
            }
          : {}),
      };
    });
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

  handleAiModelStatus: (msg: AiModelStatusMessage) => {
    set({
      modelStatus: {
        profile: msg.profile === 'stock' ? 'stock' : 'trained',
        modelName: msg.modelName || (msg.profile === 'stock' ? 'yolo26l.pt' : 'best.pt'),
        confidence: msg.confidence,
        switching: Boolean(msg.switching),
      },
    });
  },

  handleAiTrackerStatus: (msg: AiTrackerStatusMessage) => {
    const tracker: AiTrackerType =
      msg.tracker === 'botsort' || msg.tracker === 'deepsort' ? msg.tracker : 'bytetrack';
    set({
      trackerStatus: {
        tracker,
        switching: Boolean(msg.switching),
      },
    });
  },

  handleConnectionEstablished: (msg: ConnectionEstablishedMessage) => {
    const selectedCameraId = get().selectedCameraId;
    vdatWsClient.sendPayload({ type: 'watch_camera', cameraId: selectedCameraId });
    set((state) => ({
      activeCameras: msg.activeCameras || [],
      modelStatus: msg.modelStatus
        ? {
            profile: msg.modelStatus.profile === 'stock' ? 'stock' : 'trained',
            modelName: msg.modelStatus.modelName,
            confidence: msg.modelStatus.confidence,
            switching: Boolean(msg.modelStatus.switching),
          }
        : state.modelStatus,
      trackerStatus: msg.trackerStatus
        ? {
            tracker:
              msg.trackerStatus.tracker === 'botsort' || msg.trackerStatus.tracker === 'deepsort'
                ? msg.trackerStatus.tracker
                : 'bytetrack',
            switching: Boolean(msg.trackerStatus.switching),
          }
        : state.trackerStatus,
    }));
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

