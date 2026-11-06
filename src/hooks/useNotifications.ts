import { useState, useEffect, useCallback } from 'react';
import {
  requestNotificationPermission,
  showBrowserNotification,
} from '../utils/notifications';
import { useSettingsStore } from '../stores/settings.store';

export function useNotifications() {
  const [permission, setPermission] = useState<NotificationPermission>('default');
  const [supported, setSupported] = useState(false);
  const settings = useSettingsStore();

  useEffect(() => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      setSupported(true);
      setPermission(Notification.permission);
    }
  }, []);

  const requestPermission = useCallback(async () => {
    const perm = await requestNotificationPermission();
    setPermission(perm);
    if (perm === 'granted') {
      settings.setBrowserNotificationsEnabled(true);
    }
    return perm;
  }, [settings]);

  const notify = useCallback(
    (title: string, body?: string, tag?: string) => {
      if (settings.browserNotificationsEnabled && permission === 'granted') {
        showBrowserNotification({ title, body, tag });
      }
    },
    [settings.browserNotificationsEnabled, permission]
  );

  return {
    isSupported: supported,
    permission,
    isGranted: permission === 'granted',
    notificationsEnabled: settings.browserNotificationsEnabled,
    setNotificationsEnabled: settings.setBrowserNotificationsEnabled,
    requestPermission,
    notify,
  };
}
