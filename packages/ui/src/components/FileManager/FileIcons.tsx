import styles from "./FileIcons.module.css";

export function FolderIcon() {
  return (
    <svg className={styles.icon} viewBox="0 0 16 16" aria-hidden>
      <path
        d="M2 4.5A1.5 1.5 0 0 1 3.5 3H6l1.2 1.2A1 1 0 0 0 7.9 4.5H12.5A1.5 1.5 0 0 1 14 6v6.5A1.5 1.5 0 0 1 12.5 14h-9A1.5 1.5 0 0 1 2 12.5v-8Z"
        fill="currentColor"
      />
    </svg>
  );
}

export function DocumentIcon() {
  return (
    <svg className={styles.icon} viewBox="0 0 16 16" aria-hidden>
      <path
        d="M4 1.5A1.5 1.5 0 0 1 5.5 0h4.1L14 4.4V14.5A1.5 1.5 0 0 1 12.5 16h-7A1.5 1.5 0 0 1 4 14.5v-13Z"
        fill="currentColor"
        opacity="0.9"
      />
      <path d="M9.5 0v3.5H14" fill="none" stroke="currentColor" strokeWidth="1" />
      <path d="M5.5 8h5M5.5 10.5h5M5.5 13h3" stroke="currentColor" strokeWidth="1.1" />
    </svg>
  );
}
