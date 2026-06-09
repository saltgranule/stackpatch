import type { ReactNode } from "react";
import styles from "./GlobalLayout.module.css";

interface GlobalLayoutProps {
  topBar: ReactNode;
  children: ReactNode;
}

export function GlobalLayout({ topBar, children }: GlobalLayoutProps) {
  return (
    <div className={styles.layout}>
      {topBar}
      <main className={styles.content}>{children}</main>
    </div>
  );
}
