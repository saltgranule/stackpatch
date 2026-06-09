import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from "react";
import styles from "./ConsoleCard.module.css";

const ConsoleCardMenuContext = createContext<(open: boolean) => void>(() => {});

export function useConsoleCardMenuOpen() {
  return useContext(ConsoleCardMenuContext);
}

export function useFieldMenuElevation() {
  const [open, setOpen] = useState(false);
  return {
    elevated: open,
    onMenuOpenChange: setOpen,
  };
}

interface ConsoleCardProps {
  tabLabel: ReactNode;
  hint?: string;
  children: ReactNode;
  className?: string;
  elevated?: boolean;
  trackMenus?: boolean;
}

export function ConsoleCard({
  tabLabel,
  hint,
  children,
  className,
  elevated = false,
  trackMenus = false,
}: ConsoleCardProps) {
  const [openMenuCount, setOpenMenuCount] = useState(0);
  const notifyMenuOpen = useCallback((open: boolean) => {
    setOpenMenuCount((count) => Math.max(0, count + (open ? 1 : -1)));
  }, []);
  const menuElevated = trackMenus && openMenuCount > 0;

  const card = (
    <article
      className={`${styles.card} ${elevated || menuElevated ? styles.elevated : ""} ${className ?? ""}`.trim()}
    >
      <div className={styles.tabSlot}>
        <span className={styles.tab}>
          {typeof tabLabel === "string" ? tabLabel : <span className={styles.tabText}>{tabLabel}</span>}
        </span>
      </div>
      <div className={styles.body}>
        {hint && <p className={styles.hint}>{hint}</p>}
        {children}
      </div>
    </article>
  );

  if (!trackMenus) {
    return card;
  }

  return (
    <ConsoleCardMenuContext.Provider value={notifyMenuOpen}>
      {card}
    </ConsoleCardMenuContext.Provider>
  );
}
