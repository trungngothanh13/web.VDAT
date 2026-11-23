export type Point2D = [number, number];
export type Polygon = Point2D[];

export type TransmitterSourceType = 'none' | 'video_file' | 'laptop_webcam';

export interface VideoInputDevice {
  deviceId: string;
  label: string;
}

export interface TrafficLightSamplingBox {
  x: number;
  y: number;
  color?: 'red' | 'green' | 'yellow';
}

export interface CameraMetadata {
  fps?: number;
  width?: number;
  height?: number;
  resolution?: string;
  tracker?: string;
  model?: string;
  [key: string]: unknown;
}

export interface ZoneProfileConfig {
  id: string;
  sourceKey: string;
  name: string;
  lanes: Polygon[];
  intersection: Polygon;
  exitZones: Polygon[];
  lightBox?: TrafficLightSamplingBox[] | unknown;
  crossingMode: boolean;
  clearanceSeconds: number;
  version: number;
  updatedAt: string;
}

export interface Camera {
  id: string;
  name: string;
  location: string;
  rtspUrl?: string | null;
  isActive: boolean;
  lastSeenAt?: string | null;
  activeSourceKey?: string | null;
  activeZoneProfileId?: string | null;
  metadata?: CameraMetadata | null;
  createdAt: string;
  updatedAt: string;
  config?: ZoneProfileConfig | null;
  isLive?: boolean;
  violationCount?: number;
}

export interface UpdateZonePayload {
  sourceKey?: string;
  name?: string;
  lanes: Polygon[];
  intersection: Polygon;
  exitZones?: Polygon[];
  lightBox?: TrafficLightSamplingBox[] | unknown;
  crossingMode?: boolean;
  clearanceSeconds?: number;
}

export interface UpdateZoneResponse {
  config: ZoneProfileConfig;
  syncedWithAI: boolean;
  message: string;
}
