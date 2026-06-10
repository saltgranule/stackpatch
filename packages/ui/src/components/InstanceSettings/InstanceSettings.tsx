import { useMemo, useState } from "react";
import type { ApplicationType, Instance } from "@stackpatch/shared";
import {
  APPLICATION_TYPES,
  getApplicationTypeDefinition,
  supportsOptionalStdinStop,
  usesStdinStop,
} from "@stackpatch/shared";
import { deleteInstance, updateInstance } from "../../api/client";
import { useNotifications } from "../../hooks/useNotifications";
import { formatDeleteInstanceConfirm } from "../../lib/instance-permissions";
import form from "../../styles/consoleForm.module.css";
import { CardDropdown, ConsoleCard } from "../ConsoleCard";
import { PageContent, PageShell } from "../PageShell/PageShell";

const APPLICATION_TYPE_OPTIONS = APPLICATION_TYPES.map((type) => ({
  value: type,
  label: getApplicationTypeDefinition(type).label,
}));

interface InstanceSettingsProps {
  instance: Instance;
  canEdit: boolean;
  canDelete: boolean;
  onUpdated: (instance: Instance) => void;
  onDeleted: () => void;
}

export function InstanceSettings({
  instance,
  canEdit,
  canDelete,
  onUpdated,
  onDeleted,
}: InstanceSettingsProps) {
  const [name, setName] = useState(instance.name);
  const [applicationType, setApplicationType] = useState(instance.applicationType);
  const [startupCommand, setStartupCommand] = useState(instance.startupCommand);
  const [workingDirectory, setWorkingDirectory] = useState(instance.workingDirectory);
  const [autoRestart, setAutoRestart] = useState(instance.autoRestart);
  const [stopCommand, setStopCommand] = useState(instance.stopCommand);
  const [memoryLimitMb, setMemoryLimitMb] = useState(
    instance.memoryLimitMb === null ? "" : String(instance.memoryLimitMb),
  );
  const [cpuLimitPercent, setCpuLimitPercent] = useState(
    instance.cpuLimitPercent === null ? "" : String(instance.cpuLimitPercent),
  );
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { notifySuccess, notifyError } = useNotifications();

  const preset = useMemo(() => getApplicationTypeDefinition(applicationType), [applicationType]);
  const showStopCommand =
    usesStdinStop(applicationType) || supportsOptionalStdinStop(applicationType);

  function handleApplicationTypeChange(nextType: ApplicationType) {
    const previousPreset = getApplicationTypeDefinition(applicationType);
    const nextPreset = getApplicationTypeDefinition(nextType);

    setApplicationType(nextType);

    if (startupCommand.trim() === previousPreset.defaultStartupCommand) {
      setStartupCommand(nextPreset.defaultStartupCommand);
    }

    if (stopCommand.trim() === previousPreset.defaultStopCommand) {
      setStopCommand(nextPreset.defaultStopCommand);
    }
  }

  function parseOptionalLimitInput(value: string): number | null {
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }
    const parsed = Number(trimmed);
    if (!Number.isInteger(parsed) || parsed < 1) {
      throw new Error("Resource limits must be positive whole numbers.");
    }
    return parsed;
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!canEdit) return;

    setSaving(true);
    setError(null);

    try {
      const parsedMemoryLimitMb = parseOptionalLimitInput(memoryLimitMb);
      const parsedCpuLimitPercent = parseOptionalLimitInput(cpuLimitPercent);
      if (parsedCpuLimitPercent !== null && parsedCpuLimitPercent > 100) {
        throw new Error("CPU limit cannot exceed 100%.");
      }

      const updated = await updateInstance(instance.id, {
        name: name.trim(),
        applicationType,
        startupCommand: startupCommand.trim(),
        workingDirectory: workingDirectory.trim(),
        memoryLimitMb: parsedMemoryLimitMb,
        cpuLimitPercent: parsedCpuLimitPercent,
        autoRestart,
        stopCommand: showStopCommand ? stopCommand.trim() : "",
      });
      onUpdated(updated);
      notifySuccess("Settings saved", `${updated.name} settings were updated.`);
    } catch (saveError) {
      const message =
        saveError instanceof Error ? saveError.message : "Failed to save settings";
      setError(message);
      notifyError("Failed to save settings", message);
    } finally {
      setSaving(false);
    }
  }

  function handleReset() {
    setName(instance.name);
    setApplicationType(instance.applicationType);
    setStartupCommand(instance.startupCommand);
    setWorkingDirectory(instance.workingDirectory);
    setAutoRestart(instance.autoRestart);
    setStopCommand(instance.stopCommand);
    setMemoryLimitMb(instance.memoryLimitMb === null ? "" : String(instance.memoryLimitMb));
    setCpuLimitPercent(instance.cpuLimitPercent === null ? "" : String(instance.cpuLimitPercent));
    setError(null);
  }

  async function handleDelete() {
    const confirmed = window.confirm(formatDeleteInstanceConfirm(instance.name));
    if (!confirmed) {
      return;
    }

    setDeleting(true);
    setError(null);

    try {
      await deleteInstance(instance.id);
      onDeleted();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Failed to delete instance");
      setDeleting(false);
    }
  }

  const hasChanges =
    name !== instance.name ||
    applicationType !== instance.applicationType ||
    startupCommand !== instance.startupCommand ||
    workingDirectory !== instance.workingDirectory ||
    autoRestart !== instance.autoRestart ||
    stopCommand !== instance.stopCommand ||
    memoryLimitMb !== (instance.memoryLimitMb === null ? "" : String(instance.memoryLimitMb)) ||
    cpuLimitPercent !==
      (instance.cpuLimitPercent === null ? "" : String(instance.cpuLimitPercent));

  return (
    <PageShell title="Instance Settings" subtitle={instance.name}>
      {error && <p className={`${form.feedback} ${form.error}`}>{error}</p>}

      <PageContent>
        <ConsoleCard
          tabLabel="general"
          hint="Startup command, working directory, application type, and restart behavior."
          trackMenus
        >
          <form className={form.form} onSubmit={handleSubmit}>
            <label className={form.field}>
              <span className={form.fieldLabel}>Name</span>
              <input value={name} onChange={(e) => setName(e.target.value)} disabled={!canEdit} />
            </label>

            <div className={form.field}>
              <span className={form.fieldLabel}>Application Type</span>
              <CardDropdown
                className={form.fullWidthDropdown}
                variant="console"
                value={applicationType}
                options={APPLICATION_TYPE_OPTIONS}
                disabled={!canEdit}
                aria-label="Application type"
                onChange={(nextType) => handleApplicationTypeChange(nextType as ApplicationType)}
              />
              <span className={form.hint}>
                {usesStdinStop(applicationType)
                  ? "Stop sends a command to the server console before escalating to a signal."
                  : supportsOptionalStdinStop(applicationType)
                    ? "Stop uses SIGTERM by default. Add a stop command to send text to stdin first."
                    : "Stop sends SIGTERM, then force-kills if the process does not exit in time."}
              </span>
            </div>

            <label className={form.field}>
              <span className={form.fieldLabel}>Start Command</span>
              <input
                value={startupCommand}
                onChange={(e) => setStartupCommand(e.target.value)}
                disabled={!canEdit}
                placeholder={preset.startupPlaceholder}
              />
              <span className={form.hint}>The full command used to start this instance.</span>
            </label>

            {showStopCommand && (
              <label className={form.field}>
                <span className={form.fieldLabel}>Stop Command</span>
                <input
                  value={stopCommand}
                  onChange={(e) => setStopCommand(e.target.value)}
                  disabled={!canEdit}
                  placeholder="stop"
                />
                <span className={form.hint}>
                  {usesStdinStop(applicationType)
                    ? "Sent to stdin when Stop is pressed. Use Terminate to force kill immediately."
                    : "Optional. When set, sent to stdin before SIGTERM on stop."}
                </span>
              </label>
            )}

            <label className={form.field}>
              <span className={form.fieldLabel}>Working Directory</span>
              <input
                value={workingDirectory}
                onChange={(e) => setWorkingDirectory(e.target.value)}
                disabled={!canEdit}
              />
            </label>

            <label className={form.optionRow}>
              <input
                type="checkbox"
                className={form.checkbox}
                checked={autoRestart}
                onChange={(e) => setAutoRestart(e.target.checked)}
                disabled={!canEdit}
                aria-label="Auto-restart on crash"
              />
              <span className={form.optionBody}>
                <span className={form.optionTitle}>Auto-Restart on Crash</span>
                <span className={form.optionHint}>
                  Automatically restart the process if it exits unexpectedly.
                </span>
              </span>
            </label>

            {canEdit && (
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
            )}
          </form>
        </ConsoleCard>

        <ConsoleCard
          tabLabel="resources"
          hint="Optional memory and CPU caps enforced via Windows Job Objects. Restart the instance to apply changes."
          trackMenus
        >
          <form className={form.form} onSubmit={handleSubmit}>
            <label className={form.field}>
              <span className={form.fieldLabel}>Memory Limit (MB)</span>
              <input
                type="number"
                min={1}
                value={memoryLimitMb}
                onChange={(event) => setMemoryLimitMb(event.target.value)}
                disabled={!canEdit}
                placeholder="Unlimited"
              />
              <span className={form.hint}>
                Hard cap on process memory. Leave empty for no limit.
              </span>
            </label>

            <label className={form.field}>
              <span className={form.fieldLabel}>CPU Limit (%)</span>
              <input
                type="number"
                min={1}
                max={100}
                value={cpuLimitPercent}
                onChange={(event) => setCpuLimitPercent(event.target.value)}
                disabled={!canEdit}
                placeholder="Unlimited"
              />
              <span className={form.hint}>
                Maximum CPU share for this instance (1–100). Leave empty for no limit.
              </span>
            </label>

            {canEdit && (
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
            )}
          </form>
        </ConsoleCard>

        {canDelete && (
          <ConsoleCard
            tabLabel="delete"
            hint="Remove this instance from the panel. The process will be stopped if running. Files in the working directory are kept on disk."
          >
            <div className={form.actions}>
              <button
                type="button"
                className={form.actionPrimary}
                onClick={() => void handleDelete()}
                disabled={deleting}
              >
                {deleting ? "Deleting…" : "Delete Instance"}
              </button>
            </div>
          </ConsoleCard>
        )}
      </PageContent>
    </PageShell>
  );
}
