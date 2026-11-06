import { create } from 'zustand';
import { STORAGE_KEYS, DEFAULT_APP_SETTINGS } from '../config/constants';

export interface AppSettings {
  soundAlertsEnabled: boolean;
  soundAlertVolume: number;
  browserNotificationsEnabled: boolean;
  autoDownloadProofVideos: boolean;
  maxRecentAlertsInFeed: number;
  targetStreamFps: number;
  darkTheme: boolean;
}

interface SettingsStoreState extends AppSettings {
  // Actions
  initialize: () => void;
  setSoundAlertsEnabled: (enabled: boolean) => void;
  setSoundAlertVolume: (volume: number) => void;
  setBrowserNotificationsEnabled: (enabled: boolean) => void;
  setAutoDownloadProofVideos: (autoDownload: boolean) => void;
  setMaxRecentAlertsInFeed: (max: number) => void;
  setTargetStreamFps: (fps: number) => void;
  setDarkTheme: (dark: boolean) => void;
  resetDefaults: () => void;
}

const saveSettings = (settings: AppSettings) => {
  if (typeof window !== 'undefined') {
    localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(settings));
  }
};

export const useSettingsStore = create<SettingsStoreState>((set, get) => ({
  ...DEFAULT_APP_SETTINGS,

  initialize: () => {
    if (typeof window === 'undefined') return;
    try {
      const stored = localStorage.getItem(STORAGE_KEYS.SETTINGS);
      if (stored) {
        const parsed = JSON.parse(stored) as Partial<AppSettings>;
        set((state) => ({ ...state, ...parsed }));
      }
    } catch {
      // Use defaults on error
    }
  },

  setSoundAlertsEnabled: (enabled: boolean) => {
    set({ soundAlertsEnabled: enabled });
    saveSettings(get());
  },

  setSoundAlertVolume: (volume: number) => {
    const clamped = Math.max(0, Math.min(1, volume));
    set({ soundAlertVolume: clamped });
    saveSettings(get());
  },

  setBrowserNotificationsEnabled: (enabled: boolean) => {
    set({ browserNotificationsEnabled: enabled });
    saveSettings(get());
  },

  setAutoDownloadProofVideos: (autoDownload: boolean) => {
    set({ autoDownloadProofVideos: autoDownload });
    saveSettings(get());
  },

  setMaxRecentAlertsInFeed: (max: number) => {
    set({ maxRecentAlertsInFeed: max });
    saveSettings(get());
  },

  setTargetStreamFps: (fps: number) => {
    set({ targetStreamFps: fps });
    saveSettings(get());
  },

  setDarkTheme: (dark: boolean) => {
    set({ darkTheme: dark });
    saveSettings(get());
  },

  resetDefaults: () => {
    set({ ...DEFAULT_APP_SETTINGS });
    saveSettings(DEFAULT_APP_SETTINGS);
  },
}));

