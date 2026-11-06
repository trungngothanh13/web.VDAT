import { useCallback } from 'react';
import { playViolationAlertChime, playSuccessTone } from '../utils/sound';
import { useSettingsStore } from '../stores/settings.store';

export function useAudioAlert() {
  const settings = useSettingsStore();

  const playViolationChime = useCallback(() => {
    if (settings.soundAlertsEnabled) {
      playViolationAlertChime(settings.soundAlertVolume);
    }
  }, [settings.soundAlertsEnabled, settings.soundAlertVolume]);

  const playSuccess = useCallback(() => {
    if (settings.soundAlertsEnabled) {
      playSuccessTone(settings.soundAlertVolume);
    }
  }, [settings.soundAlertsEnabled, settings.soundAlertVolume]);

  return {
    playViolationChime,
    playSuccess,
    soundAlertsEnabled: settings.soundAlertsEnabled,
    soundAlertVolume: settings.soundAlertVolume,
    setSoundAlertsEnabled: settings.setSoundAlertsEnabled,
    setSoundAlertVolume: settings.setSoundAlertVolume,
  };
}

