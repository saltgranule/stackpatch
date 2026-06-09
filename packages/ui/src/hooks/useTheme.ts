import { useCallback, useEffect, useState } from "react";
import type { ThemePreference } from "@stackpatch/shared";

function resolveTheme(preference: ThemePreference): "light" | "dark" {
  if (preference === "system") {
    return window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";
  }
  return preference;
}

export function useTheme() {
  const [preference, setPreference] = useState<ThemePreference>(() => {
    const stored = localStorage.getItem("stackpatch-theme");
    if (stored === "light" || stored === "dark" || stored === "system") {
      return stored;
    }
    return "system";
  });

  const [resolved, setResolved] = useState<"light" | "dark">(() =>
    resolveTheme(preference),
  );

  useEffect(() => {
    const apply = () => setResolved(resolveTheme(preference));
    apply();

    if (preference === "system") {
      const media = window.matchMedia("(prefers-color-scheme: dark)");
      media.addEventListener("change", apply);
      return () => media.removeEventListener("change", apply);
    }
  }, [preference]);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", resolved);
  }, [resolved]);

  const setTheme = useCallback((next: ThemePreference) => {
    setPreference(next);
    localStorage.setItem("stackpatch-theme", next);
  }, []);

  const cycleTheme = useCallback(() => {
    const order: ThemePreference[] = ["system", "light", "dark"];
    const index = order.indexOf(preference);
    setTheme(order[(index + 1) % order.length]!);
  }, [preference, setTheme]);

  return { preference, resolved, setTheme, cycleTheme };
}
