import { useState, useCallback } from "react";

export type NotifType = "command" | "agent" | "healing" | "env";

export interface AppNotification {
  id: string;
  type: NotifType;
  title: string;
  body: string;
  timestamp: number;
  read: boolean;
}

const MAX_NOTIFICATIONS = 50;

export function useNotificationCenter() {
  const [notifications, setNotifications] = useState<AppNotification[]>([]);

  const addNotification = useCallback(
    (n: Omit<AppNotification, "id" | "timestamp" | "read">) => {
      setNotifications((prev) => {
        const next = [
          { ...n, id: crypto.randomUUID(), timestamp: Date.now(), read: false },
          ...prev,
        ];
        return next.slice(0, MAX_NOTIFICATIONS);
      });
    },
    [],
  );

  const markAllRead = useCallback(() => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  }, []);

  const dismiss = useCallback((id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  }, []);

  const clear = useCallback(() => setNotifications([]), []);

  const unreadCount = notifications.filter((n) => !n.read).length;

  return { notifications, unreadCount, addNotification, markAllRead, dismiss, clear };
}
