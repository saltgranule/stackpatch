import styles from "./FileActionProgress.module.css";

interface FileActionProgressProps {
  label: string;
  progress: number | null;
}

export function FileActionProgress({ label, progress }: FileActionProgressProps) {
  const indeterminate = progress === null;
  const clampedProgress = progress === null ? 0 : Math.min(100, Math.max(0, progress));

  return (
    <div
      className={styles.progress}
      role="status"
      aria-live="polite"
      aria-label={indeterminate ? label : `${label} ${clampedProgress}%`}
    >
      <span className={styles.label}>{label}</span>
      <div className={styles.track}>
        <div
          className={`${styles.fill} ${indeterminate ? styles.indeterminate : ""}`}
          style={indeterminate ? undefined : { width: `${clampedProgress}%` }}
        />
      </div>
      {!indeterminate && <span className={styles.percent}>{clampedProgress}%</span>}
    </div>
  );
}
