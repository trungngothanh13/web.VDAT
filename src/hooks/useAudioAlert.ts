import { useSettingsStore } from '../stores/settings.store';

export function useAudioAlert() {
  const soundAlertsEnabled = useSettingsStore((s) => s.soundAlertsEnabled);
  const setSoundAlertsEnabled = useSettingsStore((s) => s.setSoundAlertsEnabled);

  return {
    soundAlertsEnabled,
    setSoundAlertsEnabled,
  };
}
