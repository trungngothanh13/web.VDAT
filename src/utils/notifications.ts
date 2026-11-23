interface NotificationOptions {
  title: string;
  body?: string;
  icon?: string;
  tag?: string;
  onClick?: () => void;
}

export function showBrowserNotification(options: NotificationOptions): Notification | null {
  if (
    typeof window === 'undefined' ||
    !('Notification' in window) ||
    Notification.permission !== 'granted'
  ) {
    return null;
  }

  const notification = new Notification(options.title, {
    body: options.body,
    icon: options.icon || '/favicon.ico',
    tag: options.tag,
  });

  if (options.onClick) {
    notification.onclick = () => {
      window.focus();
      options.onClick!();
      notification.close();
    };
  }

  return notification;
}
