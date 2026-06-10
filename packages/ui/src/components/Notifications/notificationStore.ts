import type { Notification, NotificationInput } from "./types";

export const MAX_NOTIFICATION_STACK = 3;

export interface NotificationStore {
  subscribe: (listener: () => void) => () => void;
  getSnapshot: () => readonly Notification[];
  notify: (input: NotificationInput) => string;
  dismiss: (id: string) => void;
  notifySuccess: (title: string, description?: string) => string;
  notifyError: (title: string, description?: string) => string;
  notifyInfo: (title: string, description?: string) => string;
}

function createNotificationId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `notification-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function createNotificationStore(
  maxStack = MAX_NOTIFICATION_STACK,
): NotificationStore {
  let notifications: Notification[] = [];
  const listeners = new Set<() => void>();

  function emit() {
    for (const listener of listeners) {
      listener();
    }
  }

  function dismiss(id: string) {
    const next = notifications.filter((notification) => notification.id !== id);
    if (next.length === notifications.length) {
      return;
    }
    notifications = next;
    emit();
  }

  function notify(input: NotificationInput) {
    const notification: Notification = {
      id: createNotificationId(),
      title: input.title,
      description: input.description,
      variant: input.variant ?? "info",
    };

    notifications = [...notifications, notification].slice(-maxStack);
    emit();
    return notification.id;
  }

  function notifySuccess(title: string, description?: string) {
    return notify({ title, description, variant: "success" });
  }

  function notifyError(title: string, description?: string) {
    return notify({ title, description, variant: "error" });
  }

  function notifyInfo(title: string, description?: string) {
    return notify({ title, description, variant: "info" });
  }

  return {
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getSnapshot() {
      return notifications;
    },
    notify,
    dismiss,
    notifySuccess,
    notifyError,
    notifyInfo,
  };
}
