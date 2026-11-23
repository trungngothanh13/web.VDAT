import { Violation } from './violation.types';
import { ZoneProfileConfig } from './camera.types';

export type TrafficLightState = 'red' | 'green' | 'yellow' | 'unknown' | string;

export interface FrameTelemetry {
  vehicle_count?: number;
  total_tracked?: number;
  violations_count?: number;
  fps?: number;
  light_state?: TrafficLightState;
  frame_number?: number;
  timestamp?: number | string;
  [key: string]: unknown;
}

export type AiModelProfile = 'trained' | 'stock';
export type AiTrackerType = 'bytetrack' | 'botsort' | 'deepsort';

export interface AiModelStatus {
  profile: AiModelProfile;
  modelName: string;
  confidence?: number;
  switching?: boolean;
}

export interface AiTrackerStatus {
  tracker: AiTrackerType;
  switching?: boolean;
}

export interface ConnectionEstablishedMessage {
  type: 'connection_established';
  activeCameras: string[];
  modelStatus?: AiModelStatus;
  trackerStatus?: AiTrackerStatus;
  timestamp: number;
}

export interface AiModelStatusMessage extends AiModelStatus {
  type: 'ai_model_status';
  timestamp: number;
}

export interface AiTrackerStatusMessage extends AiTrackerStatus {
  type: 'ai_tracker_status';
  timestamp: number;
}

export interface CameraStatusMessage {
  type: 'camera_status';
  cameraId: string;
  status: 'ONLINE' | 'OFFLINE';
  timestamp: number;
}

export interface LiveFrameMessage {
  type: 'live_frame';
  cameraId: string;
  telemetry: FrameTelemetry;
  image: string; // Base64 JPEG string or blob URL
  timestamp: number;
}

/** Compact tuple: [x1, y1, x2, y2, shortClass, trackId, isViolation(0|1)] */
export type OverlayDetectionTuple = [number, number, number, number, string, number, number];

export interface LiveOverlayPayload {
  sourceFrameId?: number | null;
  width: number;
  height: number;
  detections: OverlayDetectionTuple[];
}

export interface LiveOverlayMessage {
  type: 'live_overlay';
  cameraId: string;
  overlay: LiveOverlayPayload;
  telemetry: FrameTelemetry;
  timestamp: number;
}

export interface CameraSourceStatusMessage {
  type: 'camera_source_status';
  cameraId: string;
  status: 'playing' | 'stopped' | 'ended' | 'error';
  sourceType?: string;
  label?: string;
  error?: string;
  timestamp: number;
}

export interface CameraTelemetryMessage {
  type: 'camera_telemetry';
  cameraId: string;
  telemetry: FrameTelemetry;
  timestamp: number;
}

export interface ViolationAlertMessage {
  type: 'violation_alert';
  violation: Violation;
}

export interface EvidenceClipUpdateMessage {
  type: 'evidence_clip_update';
  cameraId: string;
  trackId: number;
  frameNumber: number;
  evidenceClipUrl: string;
  violationId?: string;
}

export interface CameraProfileSwitchedMessage {
  type: 'camera_profile_switched';
  cameraId: string;
  sourceKey: string;
  config: ZoneProfileConfig | null;
  timestamp: number;
}

export interface PongMessage {
  type: 'pong';
  timestamp: number;
}

export type InboundWSMessage =
  | ConnectionEstablishedMessage
  | CameraStatusMessage
  | AiModelStatusMessage
  | AiTrackerStatusMessage
  | LiveFrameMessage
  | LiveOverlayMessage
  | CameraSourceStatusMessage
  | CameraTelemetryMessage
  | CameraProfileSwitchedMessage
  | ViolationAlertMessage
  | EvidenceClipUpdateMessage
  | PongMessage;

export interface PingMessage {
  type: 'ping';
}

export type OutboundWSMessage = PingMessage;

export type StreamConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'reconnecting';

