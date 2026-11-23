import { create } from 'zustand';
import { env } from '../config/env';
import { vdatWsClient } from '../websocket/client';
import {
  FrameTelemetry,
  StreamConnectionStatus,
  CameraPreviewMessage,
  CameraBypassZonesStatusMessage,
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

interface StreamStoreState {
  selectedCameraId: string;
  activeCameras: string[];
  modelStatus: AiModelStatus;
  trackerStatus: AiTrackerStatus;
  connectionStatus: StreamConnectionStatus;
  cameraPreviews: Record<string, string>;
  bypassZonesByCamera: Record<string, boolean>;
  telemetry: FrameTelemetry;
  telemetryByCamera: Record<string, FrameTelemetry>;
  isPaused: boolean;

  // Actions
  setSelectedCamera: (cameraId: string) => void;
  switchAiModel: (profile: AiModelProfile) => void;
  switchAiTracker: (tracker: AiTrackerType) => void;
  setCameraBypassZones: (cameraId: string, bypass: boolean) => void;
  setConnectionStatus: (status: StreamConnectionStatus) => void;
  togglePause: () => void;

  // WebSocket message handlers
  handleCameraPreview: (msg: CameraPreviewMessage) => void;
  handleCameraBypassZonesStatus: (msg: CameraBypassZonesStatusMessage) => void;
  handleCameraSourceStatus: (msg: CameraSourceStatusMessage) => void;
  handleCameraTelemetry: (msg: CameraTelemetryMessage) => void;
  handleCameraStatus: (msg: CameraStatusMessage) => void;
  handleAiModelStatus: (msg: AiModelStatusMessage) => void;
  handleAiTrackerStatus: (msg: AiTrackerStatusMessage) => void;
  handleConnectionEstablished: (msg: ConnectionEstablishedMessage) => void;
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
  cameraPreviews: {},
  bypassZonesByCamera: {},
  telemetry: { ...DEFAULT_TELEMETRY },
  telemetryByCamera: {},
  isPaused: false,

  setSelectedCamera: (cameraId: string) => {
    vdatWsClient.sendPayload({ type: 'watch_camera', cameraId });
    const { telemetryByCamera } = get();
    set({
      selectedCameraId: cameraId,
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

  setCameraBypassZones: (cameraId: string, bypass: boolean) => {
    set((state) => ({
      bypassZonesByCamera: { ...state.bypassZonesByCamera, [cameraId]: bypass },
    }));
    vdatWsClient.sendPayload({
      type: 'set_camera_bypass_zones',
      cameraId,
      bypass,
    });
  },

  setConnectionStatus: (status: StreamConnectionStatus) => {
    set({ connectionStatus: status });
  },

  togglePause: () => set((state) => ({ isPaused: !state.isPaused })),

  handleCameraPreview: (msg: CameraPreviewMessage) => {
    if (!msg.image) return;
    const src = normalizeFrameSrc(msg.image);
    set((state) => ({
      cameraPreviews: { ...state.cameraPreviews, [msg.cameraId]: src },
    }));
  },

  handleCameraBypassZonesStatus: (msg: CameraBypassZonesStatusMessage) => {
    set((state) => ({
      bypassZonesByCamera: {
        ...state.bypassZonesByCamera,
        [msg.cameraId]: Boolean(msg.bypass),
      },
    }));
  },

  handleCameraSourceStatus: (msg: CameraSourceStatusMessage) => {
    if (msg.status !== 'stopped' && msg.status !== 'ended') return;
    set((state) => {
      const updatedPreviews = { ...state.cameraPreviews };
      delete updatedPreviews[msg.cameraId];
      const isFocused = msg.cameraId === state.selectedCameraId;
      return {
        cameraPreviews: updatedPreviews,
        ...(isFocused ? { telemetry: { ...DEFAULT_TELEMETRY } } : {}),
      };
    });
  },

  handleCameraTelemetry: (msg: CameraTelemetryMessage) => {
    if (!msg.telemetry) return;
    const state = get();
    const isFocused = msg.cameraId === state.selectedCameraId;
    const prevTel = state.telemetryByCamera[msg.cameraId];
    const now = Date.now();

    // Throttle unfocused wall telemetry updates so 6 cameras don't trigger excessive React renders
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

    set((curr) => ({
      telemetryByCamera: { ...curr.telemetryByCamera, [msg.cameraId]: msg.telemetry },
      ...(msg.cameraId === curr.selectedCameraId && !curr.isPaused
        ? { telemetry: msg.telemetry }
        : {}),
    }));
  },

  handleCameraStatus: (msg: CameraStatusMessage) => {
    set((state) => {
      const activeSet = new Set(state.activeCameras);
      if (msg.status === 'ONLINE') {
        activeSet.add(msg.cameraId);
        return { activeCameras: Array.from(activeSet) };
      }

      activeSet.delete(msg.cameraId);
      const updatedPreviews = { ...state.cameraPreviews };
      delete updatedPreviews[msg.cameraId];
      const isCurrentCam = msg.cameraId === state.selectedCameraId;
      return {
        activeCameras: Array.from(activeSet),
        cameraPreviews: updatedPreviews,
        ...(isCurrentCam ? { telemetry: { ...DEFAULT_TELEMETRY } } : {}),
      };
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
    const initialPreviews: Record<string, string> = {};
    if (msg.cameraPreviews) {
      for (const [camId, img] of Object.entries(msg.cameraPreviews)) {
        if (img) initialPreviews[camId] = normalizeFrameSrc(img);
      }
    }
    set((state) => ({
      activeCameras: msg.activeCameras || [],
      cameraPreviews: { ...state.cameraPreviews, ...initialPreviews },
      bypassZonesByCamera: msg.bypassZonesByCamera
        ? { ...msg.bypassZonesByCamera }
        : state.bypassZonesByCamera,
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
}));
