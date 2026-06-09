import type { HealthResponse, Instance } from "@stackpatch/shared";
import styles from "./TopBar.module.css";

export type GlobalNavItem = "overview" | "instances" | "logs" | "users" | "settings";

const GLOBAL_NAV: { id: GlobalNavItem; label: string; adminOnly?: boolean }[] = [
  { id: "overview", label: "Overview" },
  { id: "instances", label: "Instances" },
  { id: "logs", label: "Logs", adminOnly: true },
  { id: "users", label: "Users", adminOnly: true },
  { id: "settings", label: "Settings", adminOnly: true },
];

interface TopBarBaseProps {
  health: HealthResponse | null;
  username: string;
  onLogout: () => void;
}

interface GlobalTopBarProps extends TopBarBaseProps {
  variant: "global";
  activeNav: GlobalNavItem;
  showAdminNav: boolean;
  onNavChange: (nav: GlobalNavItem) => void;
}

interface InstanceTopBarProps extends TopBarBaseProps {
  variant: "instance";
  instance: Instance;
  actionLoading: boolean;
  canControl: boolean;
  onStart: () => void;
  onStop: () => void;
  onTerminate: () => void;
  onRestart: () => void;
}

type TopBarProps = GlobalTopBarProps | InstanceTopBarProps;

function isActive(status: Instance["status"]): boolean {
  return status === "running" || status === "starting" || status === "stopping";
}

function canGracefulStop(status: Instance["status"]): boolean {
  return status === "running" || status === "starting";
}

export function TopBar(props: TopBarProps) {
  const { health, username, onLogout } = props;
  const daemonOk = health?.daemon === "connected";

  return (
    <header className={styles.topBar}>
      <div className={styles.left}>
        {props.variant === "global" ? (
          <>
            <nav className={styles.globalNav}>
              {GLOBAL_NAV.filter((item) => !item.adminOnly || props.showAdminNav).map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={`${styles.navItem} ${props.activeNav === item.id ? styles.navItemActive : ""}`}
                  onClick={() => props.onNavChange(item.id)}
                >
                  {item.label}
                </button>
              ))}
            </nav>
          </>
        ) : (
          <div className={styles.instanceActions}>
            <button
              type="button"
              className={styles.actionPrimary}
              disabled={!props.canControl || props.actionLoading || isActive(props.instance.status) || !daemonOk}
              onClick={props.onStart}
            >
              Start
            </button>
            <button
              type="button"
              className={styles.actionSecondary}
              disabled={!props.canControl || props.actionLoading || !canGracefulStop(props.instance.status) || !daemonOk}
              onClick={props.onStop}
              title="Graceful shutdown — behavior depends on application type"
            >
              Stop
            </button>
            <button
              type="button"
              className={styles.actionSecondary}
              disabled={!props.canControl || props.actionLoading || !isActive(props.instance.status) || !daemonOk}
              onClick={props.onTerminate}
              title="Force stop the process tree immediately"
            >
              <span className={styles.actionLabel}>Terminate</span>
              <span className={styles.actionLabelShort}>Term</span>
            </button>
            <button
              type="button"
              className={styles.actionSecondary}
              disabled={!props.canControl || props.actionLoading || !daemonOk}
              onClick={props.onRestart}
            >
              <span className={styles.actionLabel}>Restart</span>
              <span className={styles.actionLabelShort}>Rst</span>
            </button>
          </div>
        )}
      </div>

      <div className={styles.right}>
        <button type="button" className={styles.user} onClick={onLogout} title={`Sign out (${username})`}>
          <span className={styles.userName}>{username}</span>
          <span className={styles.userNameShort}>Out</span>
        </button>
      </div>
    </header>
  );
}
