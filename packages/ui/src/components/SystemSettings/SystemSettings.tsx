import { useEffect, useState } from "react";
import type { SystemSettingsStatus, ThemePreference } from "@stackpatch/shared";
import { fetchSystemSettings, updateSystemSettings } from "../../api/client";
import form from "../../styles/consoleForm.module.css";
import { ConsoleCard } from "../ConsoleCard";
import { PageContent, PageShell, pageShellStyles } from "../PageShell/PageShell";
import styles from "./SystemSettings.module.css";

const THEME_OPTIONS: { id: ThemePreference; label: string }[] = [
  { id: "system", label: "Auto" },
  { id: "light", label: "Light" },
  { id: "dark", label: "Dark" },
];

interface SystemSettingsProps {
  themePreference: ThemePreference;
  onThemeChange: (theme: ThemePreference) => void;
}

export function SystemSettings({ themePreference, onThemeChange }: SystemSettingsProps) {
  const [status, setStatus] = useState<SystemSettingsStatus | null>(null);
  const [panelPort, setPanelPort] = useState("");
  const [daemonPort, setDaemonPort] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let cancelled = false;

    fetchSystemSettings()
      .then((result) => {
        if (cancelled) return;
        setStatus(result);
        setPanelPort(String(result.settings.panelPort));
        setDaemonPort(String(result.settings.daemonPort));
      })
      .catch((loadError) => {
        if (cancelled) return;
        setError(loadError instanceof Error ? loadError.message : "Failed to load settings");
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const hasChanges =
    status !== null &&
    (Number(panelPort) !== status.settings.panelPort ||
      Number(daemonPort) !== status.settings.daemonPort);

  function handleReset() {
    if (!status) return;
    setPanelPort(String(status.settings.panelPort));
    setDaemonPort(String(status.settings.daemonPort));
    setError(null);
    setSaved(false);
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!status) return;

    setSaving(true);
    setError(null);
    setSaved(false);

    try {
      const updated = await updateSystemSettings({
        panelPort: Number(panelPort),
        daemonPort: Number(daemonPort),
      });
      setStatus(updated);
      setPanelPort(String(updated.settings.panelPort));
      setDaemonPort(String(updated.settings.daemonPort));
      setSaved(true);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Failed to save settings");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <div className={pageShellStyles.state}>Loading system settings…</div>;
  }

  if (!status) {
    return <div className={pageShellStyles.state}>{error ?? "System settings unavailable."}</div>;
  }

  return (
    <PageShell title="System Settings" subtitle="Panel configuration and appearance.">
      {error && <p className={`${form.feedback} ${form.error}`}>{error}</p>}

      <PageContent>
        <ConsoleCard
          tabLabel="networking"
          hint="Configure the panel web port and the daemon IPC port used for console streaming and process control."
        >
          <form className={form.form} onSubmit={handleSubmit}>
            <label className={form.field}>
              <span className={form.fieldLabel}>Panel Port</span>
              <input
                type="number"
                min={1}
                max={65535}
                value={panelPort}
                onChange={(event) => setPanelPort(event.target.value)}
              />
              <span className={form.hint}>
                Web UI and API port. Open the panel at http://localhost:{status.activePanelPort}.
                {status.envOverrides.panelPort
                  ? " STACKPATCH_PORT is overriding the saved value."
                  : status.settings.panelPort !== status.activePanelPort
                    ? ` Saved as ${status.settings.panelPort}; restart to apply.`
                    : null}
              </span>
            </label>

            <label className={form.field}>
              <span className={form.fieldLabel}>Daemon Port</span>
              <input
                type="number"
                min={1}
                max={65535}
                value={daemonPort}
                onChange={(event) => setDaemonPort(event.target.value)}
              />
              <span className={form.hint}>
                IPC port for the background daemon that streams console output and manages processes.
                Currently active on {status.activeDaemonPort}.
                {status.envOverrides.daemonPort
                  ? " STACKPATCH_DAEMON_PORT is overriding the saved value."
                  : status.settings.daemonPort !== status.activeDaemonPort
                    ? ` Saved as ${status.settings.daemonPort}; restart to apply.`
                    : null}
              </span>
            </label>

            {(status.envOverrides.panelPort || status.envOverrides.daemonPort) && (
              <p className={form.warning}>
                {[
                  status.envOverrides.panelPort && "STACKPATCH_PORT",
                  status.envOverrides.daemonPort && "STACKPATCH_DAEMON_PORT",
                ]
                  .filter(Boolean)
                  .join(" and ")}{" "}
                {status.envOverrides.panelPort && status.envOverrides.daemonPort ? "are" : "is"} overriding
                saved settings. Remove{" "}
                {status.envOverrides.panelPort && status.envOverrides.daemonPort ? "them" : "it"} and restart
                stackpatch to use the values saved here.
              </p>
            )}

            {status.restartRequired && !saved && (
              <p className={form.warning}>Restart stackpatch for port changes to take effect.</p>
            )}

            {saved && (
              <p className={`${form.feedback} ${form.success}`}>
                {status.restartRequired || status.envOverrides.panelPort || status.envOverrides.daemonPort
                  ? "Settings saved. Restart stackpatch to apply port changes."
                  : "Settings saved."}
              </p>
            )}

            <div className={form.actions}>
              <button type="submit" className={form.actionPrimary} disabled={saving}>
                {saving ? "Saving…" : "Save Settings"}
              </button>
              <button
                type="button"
                className={form.actionSecondary}
                onClick={handleReset}
                disabled={saving || !hasChanges}
              >
                Reset
              </button>
            </div>
          </form>
        </ConsoleCard>

        <ConsoleCard
          tabLabel="appearance"
          hint="Choose how the panel looks. Auto follows your system light or dark preference."
        >
          <div className={styles.themeField}>
            <span className={form.fieldLabel}>Theme</span>
            <div className={styles.themeSwitch} role="group" aria-label="Theme">
              {THEME_OPTIONS.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  className={`${styles.themeOption} ${themePreference === option.id ? styles.themeOptionActive : ""}`}
                  onClick={() => onThemeChange(option.id)}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        </ConsoleCard>

        <ConsoleCard tabLabel="services">
          <div className={styles.statusList}>
            <p className={styles.statusItem}>
              Panel (active): <span className={styles.statusValue}>{status.activePanelPort}</span>
            </p>
            <p className={styles.statusItem}>
              Panel (saved): <span className={styles.statusValue}>{status.settings.panelPort}</span>
            </p>
            <p className={styles.statusItem}>
              Daemon IPC (active): <span className={styles.statusValue}>{status.activeDaemonPort}</span>
            </p>
            <p className={styles.statusItem}>
              Daemon IPC (saved): <span className={styles.statusValue}>{status.settings.daemonPort}</span>
            </p>
          </div>
        </ConsoleCard>
      </PageContent>
    </PageShell>
  );
}
