import { useEffect, useState } from "react";
import type { ApplicationType, Instance } from "@stackpatch/shared";
import {
  APPLICATION_TYPES,
  DEFAULT_APPLICATION_TYPE,
  getApplicationTypeDefinition,
} from "@stackpatch/shared";
import {
  createInstance,
  fetchPathDefaults,
  fetchSuggestedWorkingDirectory,
} from "../../api/client";
import { useNotifications } from "../../hooks/useNotifications";
import form from "../../styles/consoleForm.module.css";
import { CardDropdown, ConsoleCard } from "../ConsoleCard";
import { JavaRuntimeCard } from "../JavaRuntimeCard/JavaRuntimeCard";
import { PageContent, PageShell } from "../PageShell/PageShell";

const APPLICATION_TYPE_OPTIONS = APPLICATION_TYPES.map((type) => ({
  value: type,
  label: getApplicationTypeDefinition(type).label,
}));

interface CreateInstanceFormProps {
  onCreated: (instance: Instance) => void;
  onCancel?: () => void;
}

export function CreateInstanceForm({ onCreated, onCancel }: CreateInstanceFormProps) {
  const [applicationType, setApplicationType] = useState<ApplicationType>(DEFAULT_APPLICATION_TYPE);
  const [name, setName] = useState("");
  const [startupCommand, setStartupCommand] = useState(
    () => getApplicationTypeDefinition(DEFAULT_APPLICATION_TYPE).defaultStartupCommand,
  );
  const [workingDirectory, setWorkingDirectory] = useState("");
  const [instancesRoot, setInstancesRoot] = useState("");
  const [pathTouched, setPathTouched] = useState(false);
  const [commandTouched, setCommandTouched] = useState(false);
  const [autoRestart, setAutoRestart] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { notifyError } = useNotifications();

  useEffect(() => {
    fetchPathDefaults()
      .then((defaults) => setInstancesRoot(defaults.instancesRoot))
      .catch(() => setInstancesRoot(".data/instances"));
  }, []);

  useEffect(() => {
    if (pathTouched || !name.trim()) return;

    const timer = setTimeout(() => {
      fetchSuggestedWorkingDirectory(name)
        .then((defaults) => {
          if (defaults.suggestedWorkingDirectory) {
            setWorkingDirectory(defaults.suggestedWorkingDirectory);
          }
        })
        .catch(() => undefined);
    }, 200);

    return () => clearTimeout(timer);
  }, [name, pathTouched]);

  function handleApplicationTypeChange(nextType: ApplicationType) {
    const previousPreset = getApplicationTypeDefinition(applicationType);
    const nextPreset = getApplicationTypeDefinition(nextType);

    setApplicationType(nextType);

    if (!commandTouched || startupCommand.trim() === previousPreset.defaultStartupCommand) {
      setStartupCommand(nextPreset.defaultStartupCommand);
      setCommandTouched(false);
    }
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    const preset = getApplicationTypeDefinition(applicationType);

    try {
      const instance = await createInstance({
        name: name.trim(),
        applicationType,
        startupCommand: startupCommand.trim(),
        workingDirectory: workingDirectory.trim() || undefined,
        autoRestart,
        stopCommand: preset.defaultStopCommand || undefined,
      });
      onCreated(instance);
    } catch (submitError) {
      const message =
        submitError instanceof Error ? submitError.message : "Failed to create instance";
      setError(message);
      notifyError("Failed to create instance", message);
    } finally {
      setSubmitting(false);
    }
  }

  const preset = getApplicationTypeDefinition(applicationType);

  return (
    <PageShell title="New Instance" subtitle="Create a new hosted process on this machine.">
      <PageContent>
        <ConsoleCard
          tabLabel="new instance"
          hint={`Files live under ${instancesRoot || ".data/instances"}.`}
          trackMenus
        >
          <form className={form.form} onSubmit={handleSubmit}>
            <label className={form.field}>
              <span className={form.fieldLabel}>Name</span>
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="My server"
                required
              />
            </label>

            <div className={form.field}>
              <span className={form.fieldLabel}>Application Type</span>
              <CardDropdown
                className={form.fullWidthDropdown}
                variant="console"
                value={applicationType}
                options={APPLICATION_TYPE_OPTIONS}
                aria-label="Application type"
                onChange={(nextType) => handleApplicationTypeChange(nextType as ApplicationType)}
              />
              <span className={form.hint}>
                Controls default commands and how Stop behaves for this instance.
              </span>
            </div>

            <label className={form.field}>
              <span className={form.fieldLabel}>Start Command</span>
              <input
                value={startupCommand}
                onChange={(event) => {
                  setCommandTouched(true);
                  setStartupCommand(event.target.value);
                }}
                placeholder={preset.startupPlaceholder}
                required
              />
              <span className={form.hint}>Program and arguments on one line.</span>
            </label>

            <label className={form.field}>
              <span className={form.fieldLabel}>Working Directory</span>
              <input
                value={workingDirectory}
                onChange={(event) => {
                  setPathTouched(true);
                  setWorkingDirectory(event.target.value);
                }}
                placeholder="Optional — auto-created from name"
              />
            </label>

            <label className={form.optionRow}>
              <input
                type="checkbox"
                className={form.checkbox}
                checked={autoRestart}
                onChange={(event) => setAutoRestart(event.target.checked)}
              />
              <span className={form.optionBody}>
                <span className={form.optionTitle}>Auto-Restart on Crash</span>
                <span className={form.optionHint}>
                  Automatically restart the process if it exits unexpectedly.
                </span>
              </span>
            </label>

            {error && <p className={form.error}>{error}</p>}

            <div className={form.actions}>
              {onCancel && (
                <button type="button" className={form.actionSecondary} onClick={onCancel}>
                  Cancel
                </button>
              )}
              <button type="submit" className={form.actionPrimary} disabled={submitting}>
                {submitting ? "Creating…" : "Create Instance"}
              </button>
            </div>
          </form>
        </ConsoleCard>

        <JavaRuntimeCard applicationType={applicationType} />
      </PageContent>
    </PageShell>
  );
}
