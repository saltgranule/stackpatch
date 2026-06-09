import styles from "./ActionCard.module.css";

interface ActionCardProps {
  title: string;
  hint: string;
  actionLabel: string;
  onAction: () => void;
}

export function ActionCard({ title, hint, actionLabel, onAction }: ActionCardProps) {
  return (
    <article className={styles.card}>
      <span className={styles.title}>{title}</span>
      <span className={styles.hint}>{hint}</span>
      <button type="button" className={styles.action} onClick={onAction}>
        {actionLabel}
      </button>
    </article>
  );
}
