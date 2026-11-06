import { Role } from '../types/auth.types';

export const ROUTES = {
  HOME: '/',
  LOGIN: '/login',
  LIVE_MONITOR: '/monitor',
  VIOLATIONS: '/violations',
  VIOLATION_DETAIL: (id: string = ':id') => `/violations/${id}`,
  CAMERAS: '/cameras',
  CAMERA_ZONES: (id: string = ':id') => `/cameras/${id}/zones`,
  ANALYTICS: '/analytics',
  SETTINGS: '/settings',
} as const;

export interface NavRouteItem {
  key: string;
  label: string;
  path: string;
  requiredRole?: Role;
  iconName?: string;
  description?: string;
}

export const NAVIGATION_ROUTES: NavRouteItem[] = [
  {
    key: 'live-monitor',
    label: 'Live Surveillance',
    path: ROUTES.LIVE_MONITOR,
    iconName: 'Camera',
    description: 'Real-time multi-camera video relay & instant violation alerts',
  },
  {
    key: 'violations',
    label: 'Violation Records',
    path: ROUTES.VIOLATIONS,
    iconName: 'AlertTriangle',
    description: 'Audit log, video clips, snapshots & review workflows',
  },
  {
    key: 'cameras',
    label: 'Camera Fleet',
    path: ROUTES.CAMERAS,
    iconName: 'Video',
    description: 'Registered cameras, connection status & metadata',
  },
  {
    key: 'analytics',
    label: 'Traffic Analytics',
    path: ROUTES.ANALYTICS,
    iconName: 'BarChart2',
    description: 'Vehicle counts, violation trends & camera statistics',
  },
  {
    key: 'settings',
    label: 'System Settings',
    path: ROUTES.SETTINGS,
    iconName: 'Settings',
    description: 'Audio alerts, notification preferences & stream tuning',
  },
];

/**
 * Access control permission helpers for frontend guards
 */
export const permissions = {
  canEditZones: (role?: Role | null): boolean => role === 'ADMIN',
  canReviewViolations: (role?: Role | null): boolean => role === 'ADMIN' || role === 'POLICE',
  canManageUsers: (role?: Role | null): boolean => role === 'ADMIN',
};

