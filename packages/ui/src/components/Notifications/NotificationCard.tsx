import { useCallback, useEffect, useRef, useState } from "react";
import form from "../../styles/consoleForm.module.css";
import type { Notification } from "./types";
import styles from "./NotificationCard.module.css";

const AUTO_DISMISS_MS = 3000;
const DISMISS_ANIMATION_MS = 240;

interface NotificationCardProps {
  notification: Notification;
  onDismiss: (id: string) => void;
}

export function NotificationCard({ notification, onDismiss }: NotificationCardProps) {
  const { id, title, description } = notification;
  const [exiting, setExiting] = useState(false);
  const exitingRef = useRef(false);
  const onDismissRef = useRef(onDismiss);
  const timersRef = useRef<{ auto?: ReturnType<typeof setTimeout>; exit?: ReturnType<typeof setTimeout> }>(
    {},
  );

  onDismissRef.current = onDismiss;

  const beginDismiss = useCallback(() => {
    if (exitingRef.current) {
      return;
    }

    exitingRef.current = true;

    if (timersRef.current.auto) {
      clearTimeout(timersRef.current.auto);
      timersRef.current.auto = undefined;
    }

    setExiting(true);
    timersRef.current.exit = setTimeout(() => {
      onDismissRef.current(id);
    }, DISMISS_ANIMATION_MS);
  }, [id]);

  useEffect(() => {
    timersRef.current.auto = setTimeout(beginDismiss, AUTO_DISMISS_MS);

    return () => {
      if (timersRef.current.auto) {
        clearTimeout(timersRef.current.auto);
      }
      if (timersRef.current.exit) {
        clearTimeout(timersRef.current.exit);
      }
    };
  }, [beginDismiss]);

  return (
    <article
      className={`${styles.card} ${exiting ? styles.exiting : ""}`.trim()}
      role="status"
      aria-live="polite"
    >
      <div className={styles.body}>
        <h3 className={styles.title}>{title}</h3>
        {description && <p className={styles.description}>{description}</p>}
        <div className={styles.actions}>
          <button
            type="button"
            className={`${form.actionSecondary} ${styles.closeButton}`}
            onClick={beginDismiss}
          >
            Close
          </button>
        </div>
      </div>
      <span className={styles.tail} aria-hidden="true" />
    </article>
  );
}
