import type { ReactNode } from "react";
import { MATERIAL_ICONS, MaterialIcon, type MaterialIconName } from "../../icons";
import styles from "./ActionCard.module.css";

interface ActionCardProps {
  title: string;
  hint: string;
  actionLabel: string;
  onAction?: () => void;
  href?: string;
  leadingIcon?: ReactNode;
  trailingIcon?: MaterialIconName;
}

export function ActionCard({
  title,
  hint,
  actionLabel,
  onAction,
  href,
  leadingIcon,
  trailingIcon,
}: ActionCardProps) {
  const resolvedTrailingIcon =
    trailingIcon ?? (href ? MATERIAL_ICONS.openInNew : MATERIAL_ICONS.arrowForward);

  const actionContent = (
    <>
      {leadingIcon}
      <span className={styles.actionLabel}>{actionLabel}</span>
      <MaterialIcon name={resolvedTrailingIcon} size={18} className={styles.actionIcon} />
    </>
  );

  return (
    <article className={styles.card}>
      <span className={styles.title}>{title}</span>
      <span className={styles.hint}>{hint}</span>
      {href ? (
        <a
          className={styles.action}
          href={href}
          target="_blank"
          rel="noopener noreferrer"
        >
          {actionContent}
        </a>
      ) : (
        <button type="button" className={styles.action} onClick={onAction}>
          {actionContent}
        </button>
      )}
    </article>
  );
}
