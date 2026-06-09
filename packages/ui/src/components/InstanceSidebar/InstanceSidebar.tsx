import type { Instance } from "@stackpatch/shared";
import { formatInstanceStatus } from "@stackpatch/shared";
import styles from "./InstanceSidebar.module.css";

export type InstanceNavItem = "console" | "files" | "events" | "settings";

interface InstanceSidebarProps {
  instance: Instance;
  activeNav: InstanceNavItem;
  onNavChange: (nav: InstanceNavItem) => void;
  onBack: () => void;
}

const NAV_ITEMS: { id: InstanceNavItem; label: string }[] = [
  { id: "console", label: "Console" },
  { id: "files", label: "Files" },
  { id: "events", label: "Events" },
  { id: "settings", label: "Settings" },
];

export function InstanceSidebar({
  instance,
  activeNav,
  onNavChange,
  onBack,
}: InstanceSidebarProps) {
  const statusLabel = formatInstanceStatus(instance.status);

  return (
    <aside className={styles.sidebar}>
      <button type="button" className={styles.backButton} onClick={onBack}>
        <span className={styles.backLabel}>All Instances</span>
        <span className={styles.backLabelShort}>All</span>
      </button>

      <div className={styles.instanceCard}>
        <div className={styles.instanceCardTabSlot}>
          <span className={styles.statusTab} title={statusLabel}>
            <span className={`${styles.statusDot} ${styles[instance.status]}`} />
            <span className={styles.statusLabel}>{statusLabel}</span>
          </span>
        </div>
        <div className={styles.instanceCardBody}>
          <h2 className={styles.instanceName}>{instance.name}</h2>
        </div>
      </div>

      <nav className={styles.nav}>
        {NAV_ITEMS.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`${styles.navItem} ${activeNav === item.id ? styles.navItemActive : ""}`}
            onClick={() => onNavChange(item.id)}
          >
            {item.label}
          </button>
        ))}
      </nav>
    </aside>
  );
}
