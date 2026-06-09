import type { ReactNode } from "react";
import styles from "./InstanceLayout.module.css";

interface InstanceLayoutProps {
  sidebar: ReactNode;
  topBar: ReactNode;
  children: ReactNode;
}

export function InstanceLayout({ sidebar, topBar, children }: InstanceLayoutProps) {
  return (
    <div className={styles.layout}>
      {sidebar}
      <div className={styles.main}>
        {topBar}
        <main className={styles.content}>{children}</main>
      </div>
    </div>
  );
}
