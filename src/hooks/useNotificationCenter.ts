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

export function createNotificationEntry(
  n: Omit<AppNotification, "id" | "timestamp" | "read">,
  now = Date.now(),
): AppNotification {
  return {
    ...n,
    id: crypto.randomUUID(),
    timestamp: now,
    read: false,
  };
}

export function isSameNotificationContent(
  left: Pick<AppNotification, "type" | "title" | "body">,
  right: Pick<AppNotification, "type" | "title" | "body">,
): boolean {
  return left.type === right.type && left.title === right.title && left.body === right.body;
}

export function upsertNotificationList(
  prev: AppNotification[],
  nextInput: Omit<AppNotification, "id" | "timestamp" | "read">,
  now = Date.now(),
): AppNotification[] {
  const duplicatedIndex = prev.findIndex((item) => isSameNotificationContent(item, nextInput));
  if (duplicatedIndex >= 0) {
    const duplicated = prev[duplicatedIndex]!;
    const updated: AppNotification = {
      ...duplicated,
      timestamp: now,
      read: false,
    };
    return [updated, ...prev.filter((_, index) => index !== duplicatedIndex)].slice(0, MAX_NOTIFICATIONS);
  }

  return [createNotificationEntry(nextInput, now), ...prev].slice(0, MAX_NOTIFICATIONS);
}

export function getUnreadNotificationCount(notifications: AppNotification[]): number {
  return notifications.filter((n) => !n.read).length;
}

export function useNotificationCenter() {
  const [notifications, setNotifications] = useState<AppNotification[]>([]);

  const addNotification = useCallback(
    (n: Omit<AppNotification, "id" | "timestamp" | "read">) => {
      setNotifications((prev) => upsertNotificationList(prev, n));
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
    () => getUnreadNotificationCount(notifications),
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
