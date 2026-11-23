import { Camera } from '../types/camera.types';
import { ViolationStatus } from '../types/violation.types';
import { TrafficLightState } from '../types/websocket.types';

export const STORAGE_KEYS = {
  AUTH_TOKEN: 'vdat_jwt_token',
  USER_DATA: 'vdat_user_data',
  SETTINGS: 'vdat_app_settings',
  SELECTED_CAMERA: 'vdat_selected_camera_id',
} as const;

export const VIOLATION_STATUS_CONFIG: Record<
  ViolationStatus,
  { label: string; color: string; bgColor: string; borderColor: string }
> = {
  PENDING_REVIEW: {
    label: 'Pending Review',
    color: '#f59e0b', // Amber
    bgColor: 'rgba(245, 158, 11, 0.15)',
    borderColor: 'rgba(245, 158, 11, 0.3)',
  },
  CONFIRMED: {
    label: 'Confirmed',
    color: '#ef4444', // Red
    bgColor: 'rgba(239, 68, 68, 0.15)',
    borderColor: 'rgba(239, 68, 68, 0.3)',
  },
  DISMISSED: {
    label: 'Dismissed',
    color: '#10b981', // Emerald
    bgColor: 'rgba(16, 185, 129, 0.15)',
    borderColor: 'rgba(16, 185, 129, 0.3)',
  },
};

const LIGHT_STATE_CONFIG: Record<
  string,
  { label: string; color: string; glow: string }
> = {
  red: {
    label: 'RED',
    color: '#ef4444',
    glow: '0 0 12px rgba(239, 68, 68, 0.6)',
  },
  yellow: {
    label: 'YELLOW',
    color: '#f59e0b',
    glow: '0 0 12px rgba(245, 158, 11, 0.6)',
  },
  green: {
    label: 'GREEN',
    color: '#10b981',
    glow: '0 0 12px rgba(16, 185, 129, 0.6)',
  },
  unknown: {
    label: 'UNKNOWN',
    color: '#94a3b8',
    glow: 'none',
  },
};

export const getLightConfig = (state?: TrafficLightState) => {
  const normalized = (state || 'unknown').toLowerCase();
  return LIGHT_STATE_CONFIG[normalized] || LIGHT_STATE_CONFIG.unknown;
};

export const DEFAULT_CAMERA_WIDTH = 854;
export const DEFAULT_CAMERA_HEIGHT = 480;

export const DEFAULT_APP_SETTINGS = {
  soundAlertsEnabled: true,
  soundAlertVolume: 0.7, // 0.0 - 1.0
  browserNotificationsEnabled: true,
  maxRecentAlertsInFeed: 50,
};

export const EXPIRED_THUMB_SVG =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 108 68">' +
      '<rect width="108" height="68" fill="#0f172a"/>' +
      '<rect x="3" y="3" width="102" height="62" rx="4" fill="none" stroke="#334155" stroke-dasharray="4 3" stroke-width="1"/>' +
      '<circle cx="54" cy="24" r="9" fill="none" stroke="#f59e0b" stroke-width="1.6"/>' +
      '<path d="M54 19v5l3 2" fill="none" stroke="#f59e0b" stroke-width="1.6" stroke-linecap="round"/>' +
      '<text x="54" y="49" fill="#fcd34d" font-family="Inter,sans-serif" font-size="9.5" font-weight="700" letter-spacing="0.8" text-anchor="middle">EXPIRED</text>' +
      '</svg>'
  );

export const DEFAULT_CAMERA_SLOTS: Camera[] = [
  {
    id: 'cam-01',
    name: 'Camera 01 (Primary)',
    location: 'Intersection 1',
    isActive: false,
    createdAt: '',
    updatedAt: '',
  },
  {
    id: 'cam-02',
    name: 'Camera 02',
    location: 'Intersection 2',
    isActive: false,
    createdAt: '',
    updatedAt: '',
  },
  {
    id: 'cam-03',
    name: 'Camera 03',
    location: 'Intersection 3',
    isActive: false,
    createdAt: '',
    updatedAt: '',
  },
];
