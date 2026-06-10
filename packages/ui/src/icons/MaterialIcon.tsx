import type { MaterialIconName } from "./names";
import styles from "./MaterialIcon.module.css";

interface MaterialIconProps {
  name: MaterialIconName;
  className?: string;
  size?: number;
}

export function MaterialIcon({ name, className, size = 20 }: MaterialIconProps) {
  return (
    <span
      className={["material-icons", styles.root, className].filter(Boolean).join(" ")}
      style={{ fontSize: size }}
      aria-hidden
    >
      {name}
    </span>
  );
}
