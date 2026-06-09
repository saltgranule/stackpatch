import styles from "./BrandLogo.module.css";

const LOGO_SRC = "/assets/stackpatch.png";

interface BrandLogoProps {
  size?: "sm" | "lg";
  showText?: boolean;
  align?: "left" | "center";
}

export function BrandLogo({ size = "sm", showText = true, align = "center" }: BrandLogoProps) {
  return (
    <div
      className={`${styles.brand} ${size === "lg" ? styles.large : styles.small} ${align === "left" ? styles.alignLeft : ""}`}
    >
      <img src={LOGO_SRC} alt="" className={styles.logo} />
      {showText && <span className={styles.name}>stackpatch</span>}
    </div>
  );
}
