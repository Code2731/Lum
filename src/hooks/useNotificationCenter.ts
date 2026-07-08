import { useState, useCallback, useMemo } from "react";

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

  const dismissByIds = useCallback((ids: string[]) => {
    const remove = new Set(ids);
    setNotifications((prev) => prev.filter((n) => !remove.has(n.id)));
  }, []);

  const markByIds = useCallback((ids: string[]) => {
    const target = new Set(ids);
    setNotifications((prev) => prev.map((n) => (target.has(n.id) ? { ...n, read: true } : n)));
  }, []);

  const clear = useCallback(() => setNotifications([]), []);

  const unreadCount = useMemo(
    () => notifications.filter((n) => !n.read).length,
    [notifications],
  );

  return {
    notifications,
    unreadCount,
    addNotification,
    markAllRead,
    markByIds,
    dismiss,
    dismissByIds,
    clear,
  };
}
