import { create } from 'zustand';
import { STORAGE_KEYS, DEFAULT_APP_SETTINGS } from '../config/constants';

interface AppSettings {
  soundAlertsEnabled: boolean;
  soundAlertVolume: number;
  browserNotificationsEnabled: boolean;
  maxRecentAlertsInFeed: number;
}

interface SettingsStoreState extends AppSettings {
  initialize: () => void;
  setSoundAlertsEnabled: (enabled: boolean) => void;
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
    const curr = get();
    saveSettings({
      soundAlertsEnabled: curr.soundAlertsEnabled,
      soundAlertVolume: curr.soundAlertVolume,
      browserNotificationsEnabled: curr.browserNotificationsEnabled,
      maxRecentAlertsInFeed: curr.maxRecentAlertsInFeed,
    });
  },
}));
