import type { ComponentPropsWithoutRef, ReactNode } from "react";
import styles from "./ScrollArea.module.css";

interface ScrollAreaProps extends Omit<ComponentPropsWithoutRef<"div">, "children"> {
  children: ReactNode;
  variant?: "page" | "console";
}

export function ScrollArea({
  children,
  className,
  variant = "page",
  ...props
}: ScrollAreaProps) {
  const classes = [styles.root, styles[variant], className].filter(Boolean).join(" ");

  return (
    <div className={classes} {...props}>
      {children}
    </div>
  );
}
