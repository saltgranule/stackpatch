import type { HealthResponse, Instance } from "@stackpatch/shared";
import { formatInstanceStatus } from "@stackpatch/shared";
import { ScrollArea } from "../ScrollArea/ScrollArea";
import styles from "./Overview.module.css";

interface OverviewProps {
  instances: Instance[];
  loading: boolean;
  health: HealthResponse | null;
}

function StatusCard({
  tabLabel,
  title,
  subtitle,
  dotClassName,
  details,
}: {
  tabLabel: string;
  title: string;
  subtitle: string;
  dotClassName: string;
  details?: { label: string; value: string }[];
}) {
  return (
    <article className={styles.statusCard}>
      <div className={styles.statusCardTabSlot}>
        <span className={styles.statusTab} aria-label={tabLabel} title={tabLabel}>
          <span className={`${styles.statusDot} ${dotClassName}`} />
        </span>
      </div>
      <div className={styles.statusCardBody}>
        <span className={styles.statusCardTitle}>{title}</span>
        <span className={styles.statusCardSubtitle}>{subtitle}</span>
        {details && details.length > 0 && (
          <dl className={styles.statusCardDetails}>
            {details.map((item) => (
              <div key={item.label} className={styles.detailRow}>
                <dt className={styles.detailLabel}>{item.label}</dt>
                <dd className={styles.detailValue}>{item.value}</dd>
              </div>
            ))}
          </dl>
        )}
      </div>
    </article>
  );
}

export function Overview({ instances, loading, health }: OverviewProps) {
  if (loading) {
    return <div className={styles.state}>Loading overview…</div>;
  }

  const daemonOk = health?.daemon === "connected";

  return (
    <ScrollArea className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.title}>Overview</h1>
        <p className={styles.subtitle}>Instance status on this host.</p>
      </div>

      <section className={styles.statusSection}>
        <h2 className={styles.sectionTitle}>Daemon</h2>
        <div className={styles.statusGrid}>
          <StatusCard
            tabLabel={daemonOk ? "Daemon connected" : "Daemon disconnected"}
            title="Daemon"
            subtitle={daemonOk ? "Connected" : "Disconnected"}
            dotClassName={daemonOk ? styles.daemonOnline : styles.daemonOffline}
            details={[
              { label: "Panel port", value: health ? String(health.panelPort) : "—" },
              { label: "Daemon IPC", value: health ? String(health.daemonPort) : "—" },
            ]}
          />
        </div>
      </section>

      {instances.length > 0 && (
        <section className={styles.statusSection}>
          <h2 className={styles.sectionTitle}>Instance Status</h2>
          <div className={styles.statusGrid}>
            {instances.map((instance) => {
              const statusLabel = formatInstanceStatus(instance.status);

              return (
                <StatusCard
                  key={instance.id}
                  tabLabel={statusLabel}
                  title={instance.name}
                  subtitle={statusLabel}
                  dotClassName={styles[instance.status]}
                />
              );
            })}
          </div>
        </section>
      )}
    </ScrollArea>
  );
}
