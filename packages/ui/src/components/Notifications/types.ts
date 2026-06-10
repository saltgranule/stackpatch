export type NotificationVariant = "success" | "error" | "info";

export interface NotificationInput {
  title: string;
  description?: string;
  variant?: NotificationVariant;
}

export interface Notification extends NotificationInput {
  id: string;
  variant: NotificationVariant;
}
