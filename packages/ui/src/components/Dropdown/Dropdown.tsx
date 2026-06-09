import { useEffect, useId, useRef, useState } from "react";
import styles from "./Dropdown.module.css";

export interface DropdownOption<T extends string = string> {
  value: T;
  label: string;
  disabled?: boolean;
}

interface DropdownProps<T extends string> {
  value?: T;
  options: readonly DropdownOption<T>[];
  onChange: (value: T) => void;
  disabled?: boolean;
  className?: string;
  triggerLabel?: string;
  variant?: "default" | "console";
  visibleOptionCount?: number;
  onOpenChange?: (open: boolean) => void;
  "aria-label"?: string;
}

export function Dropdown<T extends string>({
  value,
  options,
  onChange,
  disabled = false,
  className,
  triggerLabel,
  variant = "default",
  visibleOptionCount,
  onOpenChange,
  "aria-label": ariaLabel,
}: DropdownProps<T>) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const listId = useId();
  const selected = value === undefined ? undefined : options.find((option) => option.value === value);
  const triggerText = triggerLabel ?? selected?.label ?? "Select";
  const showSelection = triggerLabel === undefined && value !== undefined;
  const menuScrollable =
    visibleOptionCount !== undefined && options.length > visibleOptionCount;

  useEffect(() => {
    onOpenChange?.(open);
  }, [open, onOpenChange]);

  useEffect(() => {
    if (!open) {
      return;
    }

    function handlePointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [open]);

  return (
    <div
      ref={rootRef}
      className={`${styles.root} ${open ? styles.rootOpen : ""} ${className ?? ""}`.trim()}
    >
      <button
        type="button"
        className={`${styles.trigger} ${variant === "console" ? styles.triggerConsole : ""}`.trim()}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-label={ariaLabel}
        onClick={() => setOpen((current) => !current)}
      >
        <span className={styles.label}>{triggerText}</span>
        <span
          className={`${styles.chevron} ${variant === "console" ? styles.chevronConsole : ""}`.trim()}
          aria-hidden="true"
        />
      </button>

      {open && (
        <ul
          id={listId}
          className={`${styles.menu} ${menuScrollable ? styles.menuScrollable : ""}`.trim()}
          role="listbox"
          style={
            menuScrollable
              ? ({ "--dropdown-visible-count": visibleOptionCount } as React.CSSProperties)
              : undefined
          }
        >
          {options.map((option) => {
            const isSelected = showSelection && option.value === value;
            return (
              <li key={option.value} role="presentation">
                <button
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  disabled={option.disabled}
                  className={`${styles.option} ${isSelected ? styles.optionSelected : ""}`}
                  onClick={() => {
                    if (option.disabled) {
                      return;
                    }
                    onChange(option.value);
                    setOpen(false);
                  }}
                >
                  {option.label}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
