import { Violation } from './violation.types';

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

export interface ConnectionEstablishedMessage {
  type: 'connection_established';
  activeCameras: string[];
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
  image: string; // Base64 JPEG string
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

export interface PongMessage {
  type: 'pong';
  timestamp: number;
}

export type InboundWSMessage =
  | ConnectionEstablishedMessage
  | CameraStatusMessage
  | LiveFrameMessage
  | ViolationAlertMessage
  | EvidenceClipUpdateMessage
  | PongMessage;

export interface PingMessage {
  type: 'ping';
}

export type OutboundWSMessage = PingMessage;

export type StreamConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'reconnecting';
