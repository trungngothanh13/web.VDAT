export type Point2D = [number, number];
export type Polygon = Point2D[];

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

export interface CameraConfig {
  id: string;
  cameraId: string;
  lanes: Polygon[];
  intersection: Polygon;
  lightBox?: TrafficLightSamplingBox[] | unknown;
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
  metadata?: CameraMetadata | null;
  createdAt: string;
  updatedAt: string;
  config?: CameraConfig | null;
  isLive?: boolean;
  violationCount?: number;
}

export interface UpdateZonePayload {
  lanes: Polygon[];
  intersection: Polygon;
  lightBox?: TrafficLightSamplingBox[] | unknown;
}

export interface UpdateZoneResponse {
  config: CameraConfig;
  syncedWithAI: boolean;
  message: string;
}
