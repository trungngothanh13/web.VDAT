import { useEffect } from 'react';
import { vdatWsClient } from '../websocket/client';
import { useViolationStore } from '../stores/violation.store';
import { useSettingsStore } from '../stores/settings.store';
import { playViolationAlertChime } from '../utils/sound';
import { showBrowserNotification } from '../utils/notifications';

export function useViolationAlerts() {
  const store = useViolationStore();
  const settings = useSettingsStore();

  useEffect(() => {
    // 1. Listen for new violation alerts pushed in real-time
    const unsubAlert = vdatWsClient.onViolationAlert((msg) => {
      const violation = msg.violation;
      store.addLiveAlert(violation, settings.maxRecentAlertsInFeed);

      // Play audio chime if enabled
      if (settings.soundAlertsEnabled) {
        playViolationAlertChime(settings.soundAlertVolume);
      }

      // Show browser notification if enabled
      if (settings.browserNotificationsEnabled) {
        showBrowserNotification({
          title: `🚨 Red-Light Violation Detected!`,
          body: `Camera: ${violation.cameraId} | Vehicle: #${violation.trackId} (${violation.vehicleClass.toUpperCase()})`,
          tag: `violation-${violation.id}`,
        });
      }
    });

    // 2. Listen for evidence clip encoding/upload completion updates
    const unsubClip = vdatWsClient.onEvidenceClipUpdate((msg) => {
      store.updateClipUrl(msg.trackId, msg.frameNumber, msg.evidenceClipUrl, msg.cameraId);
    });

    return () => {
      unsubAlert();
      unsubClip();
    };
  }, [
    settings.soundAlertsEnabled,
    settings.soundAlertVolume,
    settings.browserNotificationsEnabled,
    settings.maxRecentAlertsInFeed,
  ]);

  return {
    liveAlerts: store.liveAlerts,
    unreadAlertCount: store.unreadAlertCount,
    selectedViolation: store.selectedViolation,
    clearUnreadCount: () => store.clearUnreadCount(),
    setSelectedViolation: (v: any) => store.setSelectedViolation(v),
    clearLiveAlerts: () => store.clearLiveAlerts(),
  };
}

