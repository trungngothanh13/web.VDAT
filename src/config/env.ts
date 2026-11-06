/**
 * Environment configuration for VDAT Web Dashboard.
 * Supports Vite `import.meta.env` with sensible defaults.
 */

const getEnvVar = (key: string, defaultValue: string = ''): string => {
  if (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env[key]) {
    return import.meta.env[key] as string;
  }
  return defaultValue;
};

// Compute dynamic WebSocket URL from browser location if not explicitly specified
const getDefaultWsUrl = (): string => {
  if (typeof window !== 'undefined') {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    // If running with Vite dev proxy on 5173, point directly to backend at port 5000 in dev
    if (window.location.port === '5173') {
      return `${protocol}//${window.location.hostname}:5000/ws/client`;
    }
    return `${protocol}//${window.location.host}/ws/client`;
  }
  return 'ws://localhost:5000/ws/client';
};

const getDefaultApiUrl = (): string => {
  if (typeof window !== 'undefined') {
    if (window.location.port === '5173') {
      return `http://${window.location.hostname}:5000`;
    }
    return window.location.origin;
  }
  return 'http://localhost:5000';
};

export const env = {
  apiUrl: getEnvVar('VITE_API_URL', getDefaultApiUrl()),
  wsUrl: getEnvVar('VITE_WS_URL', getDefaultWsUrl()),
  defaultCameraId: getEnvVar('VITE_DEFAULT_CAMERA_ID', 'cam-01'),
  useMockFallback: getEnvVar('VITE_USE_MOCK_FALLBACK', 'false') === 'true',
  isDev: typeof import.meta !== 'undefined' && import.meta.env ? import.meta.env.DEV : true,
  isProd: typeof import.meta !== 'undefined' && import.meta.env ? import.meta.env.PROD : false,
} as const;

