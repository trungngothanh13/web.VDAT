import { ViolationStatus, VehicleClass } from '../types/violation.types';
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

export const VEHICLE_CLASS_CONFIG: Record<
  string,
  { label: string; color: string; icon: string }
> = {
  motorcycle: {
    label: 'Motorcycle',
    color: '#38bdf8', // Sky
    icon: 'Bike',
  },
  car: {
    label: 'Car',
    color: '#818cf8', // Indigo
    icon: 'Car',
  },
  truck: {
    label: 'Truck',
    color: '#fb923c', // Orange
    icon: 'Truck',
  },
  bus: {
    label: 'Bus',
    color: '#facc15', // Yellow
    icon: 'Bus',
  },
};

export const getVehicleConfig = (vehicleClass: VehicleClass) => {
  const normalized = vehicleClass.toLowerCase();
  return (
    VEHICLE_CLASS_CONFIG[normalized] || {
      label: vehicleClass.charAt(0).toUpperCase() + vehicleClass.slice(1),
      color: '#94a3b8',
      icon: 'HelpCircle',
    }
  );
};

export const LIGHT_STATE_CONFIG: Record<
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

export const DEFAULT_APP_SETTINGS = {
  soundAlertsEnabled: true,
  soundAlertVolume: 0.7, // 0.0 - 1.0
  browserNotificationsEnabled: true,
  autoDownloadProofVideos: false,
  maxRecentAlertsInFeed: 50,
  targetStreamFps: 30,
  darkTheme: true,
};

