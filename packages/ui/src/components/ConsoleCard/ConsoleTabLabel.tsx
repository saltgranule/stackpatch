import type { ReactNode } from "react";
import dot from "../../styles/statusDot.module.css";
import styles from "./ConsoleCard.module.css";

export type ConsoleTabDotStatus =
  | "running"
  | "stopped"
  | "crashed"
  | "starting"
  | "stopping"
  | "daemonOnline"
  | "daemonOffline";

interface ConsoleTabLabelProps {
  children: ReactNode;
  dot?: ConsoleTabDotStatus;
}

export function ConsoleTabLabel({ children, dot: dotStatus }: ConsoleTabLabelProps) {
  return (
    <span className={styles.tabWithDot}>
      {dotStatus && <span className={`${dot.dot} ${dot[dotStatus]}`} aria-hidden="true" />}
      {children}
    </span>
  );
}
