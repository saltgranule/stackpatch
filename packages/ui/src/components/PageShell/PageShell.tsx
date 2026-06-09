import type { ReactNode } from "react";
import { ScrollArea } from "../ScrollArea/ScrollArea";
import styles from "./PageShell.module.css";

interface PageShellProps {
  title: string;
  subtitle?: string;
  children: ReactNode;
  className?: string;
}

export function PageShell({ title, subtitle, children, className }: PageShellProps) {
  return (
    <ScrollArea className={`${styles.page} ${className ?? ""}`.trim()}>
      <header className={styles.header}>
        <h1 className={styles.title}>{title}</h1>
        {subtitle && <p className={styles.subtitle}>{subtitle}</p>}
      </header>
      {children}
    </ScrollArea>
  );
}

interface PageContentProps {
  children: ReactNode;
  className?: string;
  wide?: boolean;
}

export function PageContent({ children, className, wide = false }: PageContentProps) {
  return (
    <div
      className={`${styles.content} ${wide ? styles.contentWide : ""} ${className ?? ""}`.trim()}
    >
      {children}
    </div>
  );
}

export { styles as pageShellStyles };
