import type { ComponentPropsWithoutRef, ReactNode } from "react";
import styles from "./ScrollArea.module.css";

interface ScrollAreaProps extends Omit<ComponentPropsWithoutRef<"div">, "children"> {
  children: ReactNode;
  variant?: "page" | "console";
  /** When false, the area sizes to its content instead of filling flex space. */
  fill?: boolean;
  orientation?: "vertical" | "horizontal";
}

export function ScrollArea({
  children,
  className,
  variant = "page",
  fill = true,
  orientation = "vertical",
  ...props
}: ScrollAreaProps) {
  const classes = [
    fill ? styles.root : styles.static,
    orientation === "horizontal" ? styles.horizontal : styles.vertical,
    styles[variant],
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={classes} {...props}>
      {children}
    </div>
  );
}
