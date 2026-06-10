import { NotificationCard } from "./NotificationCard";
import styles from "./NotificationStack.module.css";
import type { Notification } from "./types";

interface NotificationStackProps {
  notifications: Notification[];
  onDismiss: (id: string) => void;
}

export function NotificationStack({ notifications, onDismiss }: NotificationStackProps) {
  if (notifications.length === 0) {
    return null;
  }

  return (
    <div className={styles.stack} aria-label="Notifications">
      {notifications.map((notification) => (
        <div key={notification.id} className={styles.item}>
          <NotificationCard notification={notification} onDismiss={onDismiss} />
        </div>
      ))}
    </div>
  );
}
