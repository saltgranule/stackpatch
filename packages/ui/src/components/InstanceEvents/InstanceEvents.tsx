import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  Instance,
  InstanceSchedule,
  ScheduleAction,
  ScheduleIntervalUnit,
} from "@stackpatch/shared";
import {
  SCHEDULE_ACTIONS,
  SCHEDULE_INTERVAL_UNITS,
  buildScheduleIntervalOptions,
  clampScheduleInterval,
  describeScheduleInterval,
  formatScheduleAction,
  formatScheduleIntervalUnit,
} from "@stackpatch/shared";
import {
  createInstanceSchedule,
  deleteInstanceSchedule,
  fetchInstanceSchedules,
  updateInstanceSchedule,
} from "../../api/client";
import form from "../../styles/consoleForm.module.css";
import { CardDropdown, ConsoleCard, useFieldMenuElevation } from "../ConsoleCard";
import { PageContent, PageShell } from "../PageShell/PageShell";
import styles from "./InstanceEvents.module.css";

interface InstanceEventsProps {
  instance: Instance;
  canEdit: boolean;
}

const ACTION_OPTIONS = SCHEDULE_ACTIONS.map((action) => ({
  value: action,
  label: formatScheduleAction(action),
}));

const UNIT_OPTIONS = SCHEDULE_INTERVAL_UNITS.map((unit) => ({
  value: unit,
  label: formatScheduleIntervalUnit(unit),
}));

const ENABLED_OPTIONS = [
  { value: "enabled", label: "Enabled" },
  { value: "disabled", label: "Disabled" },
];

function ScheduleRow({
  schedule,
  canEdit,
  busy,
  onSetEnabled,
  onDelete,
}: {
  schedule: InstanceSchedule;
  canEdit: boolean;
  busy: boolean;
  onSetEnabled: (enabled: boolean) => Promise<void>;
  onDelete: () => Promise<void>;
}) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div
      className={`${styles.scheduleRow} ${schedule.enabled ? "" : styles.scheduleRowDisabled} ${menuOpen ? styles.scheduleRowElevated : ""}`.trim()}
    >
      <div className={styles.scheduleMain}>
        <span className={styles.scheduleTitle}>{formatScheduleAction(schedule.action)}</span>
        <span className={styles.scheduleMeta}>
          {describeScheduleInterval(schedule.intervalValue, schedule.intervalUnit)}
        </span>
        {schedule.command && (
          <span className={styles.scheduleMeta}>Command: {schedule.command}</span>
        )}
      </div>
      {canEdit && (
        <div className={styles.scheduleActions}>
          <CardDropdown
            className={styles.statusDropdown}
            variant="console"
            value={schedule.enabled ? "enabled" : "disabled"}
            options={ENABLED_OPTIONS}
            disabled={busy}
            aria-label="Schedule status"
            onOpenChange={setMenuOpen}
            onChange={(value) => void onSetEnabled(value === "enabled")}
          />
          <button
            type="button"
            className={form.actionSecondary}
            disabled={busy}
            onClick={() => void onDelete()}
          >
            Delete
          </button>
        </div>
      )}
    </div>
  );
}

export function InstanceEvents({ instance, canEdit }: InstanceEventsProps) {
  const [schedules, setSchedules] = useState<InstanceSchedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [action, setAction] = useState<ScheduleAction>("restart");
  const [intervalValue, setIntervalValue] = useState(24);
  const [intervalUnit, setIntervalUnit] = useState<ScheduleIntervalUnit>("hours");
  const [command, setCommand] = useState("");
  const actionField = useFieldMenuElevation();
  const [frequencyMenusOpen, setFrequencyMenusOpen] = useState(0);

  const registerFrequencyMenuOpen = useCallback((open: boolean) => {
    setFrequencyMenusOpen((count) => Math.max(0, count + (open ? 1 : -1)));
  }, []);

  const intervalOptions = useMemo(
    () =>
      buildScheduleIntervalOptions(intervalUnit).map((value) => ({
        value: String(value),
        label: String(value),
      })),
    [intervalUnit],
  );

  const loadSchedules = useCallback(async () => {
    try {
      const result = await fetchInstanceSchedules(instance.id);
      setSchedules(result.schedules);
      setError(null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load schedules");
      setSchedules([]);
    } finally {
      setLoading(false);
    }
  }, [instance.id]);

  useEffect(() => {
    void loadSchedules();
  }, [loadSchedules]);

  function handleIntervalUnitChange(nextUnit: ScheduleIntervalUnit) {
    setIntervalUnit(nextUnit);
    setIntervalValue((current) => clampScheduleInterval(current, nextUnit));
  }

  async function handleCreate(event: React.FormEvent) {
    event.preventDefault();
    if (!canEdit) return;

    if (action === "run_command" && !command.trim()) {
      setError("Command is required for run command schedules");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      await createInstanceSchedule(instance.id, {
        action,
        intervalValue,
        intervalUnit,
        command: action === "run_command" ? command.trim() : undefined,
      });
      setCommand("");
      await loadSchedules();
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Failed to create schedule");
    } finally {
      setSaving(false);
    }
  }

  async function handleSetEnabled(schedule: InstanceSchedule, enabled: boolean) {
    if (!canEdit || schedule.enabled === enabled) return;

    setBusyId(schedule.id);
    setError(null);

    try {
      await updateInstanceSchedule(instance.id, schedule.id, { enabled });
      await loadSchedules();
    } catch (toggleError) {
      setError(toggleError instanceof Error ? toggleError.message : "Failed to update schedule");
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete(schedule: InstanceSchedule) {
    if (!canEdit) return;

    const confirmed = window.confirm(
      `Delete this ${formatScheduleAction(schedule.action).toLowerCase()} schedule?`,
    );
    if (!confirmed) {
      return;
    }

    setBusyId(schedule.id);
    setError(null);

    try {
      await deleteInstanceSchedule(instance.id, schedule.id);
      await loadSchedules();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Failed to delete schedule");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <PageShell
      title="Events"
      subtitle="Recurring schedules for automated start, stop, restart, commands, and backups."
    >
      {error && <p className={`${form.feedback} ${form.error}`}>{error}</p>}

      <PageContent>
        <ConsoleCard
          tabLabel="schedules"
          hint="Each schedule runs on a fixed interval while the daemon is running. Missed runs while offline are not backfilled."
          trackMenus
        >
          {loading ? (
            <p className={styles.empty}>Loading schedules…</p>
          ) : schedules.length === 0 ? (
            <p className={styles.empty}>No schedules yet.</p>
          ) : (
            <div className={styles.scheduleList}>
              {schedules.map((schedule) => (
                <ScheduleRow
                  key={schedule.id}
                  schedule={schedule}
                  canEdit={canEdit}
                  busy={busyId === schedule.id}
                  onSetEnabled={(enabled) => handleSetEnabled(schedule, enabled)}
                  onDelete={() => handleDelete(schedule)}
                />
              ))}
            </div>
          )}
        </ConsoleCard>

        {canEdit && (
          <ConsoleCard tabLabel="add schedule" trackMenus>
            <form className={form.form} onSubmit={handleCreate} autoComplete="off">
              <label
                className={`${form.field} ${actionField.elevated ? form.fieldElevated : ""}`.trim()}
              >
                <span className={form.fieldLabel}>Action</span>
                <CardDropdown
                  className={form.fullWidthDropdown}
                  variant="console"
                  value={action}
                  options={ACTION_OPTIONS}
                  aria-label="Schedule action"
                  onOpenChange={actionField.onMenuOpenChange}
                  onChange={(nextAction) => setAction(nextAction as ScheduleAction)}
                />
              </label>

              <div
                className={`${form.field} ${frequencyMenusOpen > 0 ? form.fieldElevated : ""}`.trim()}
              >
                <span className={form.fieldLabel}>Frequency</span>
                <div className={styles.intervalRow}>
                  <span className={styles.intervalLabel}>Every</span>
                  <CardDropdown
                    className={styles.intervalDropdown}
                    variant="console"
                    visibleOptionCount={5}
                    value={String(intervalValue)}
                    options={intervalOptions}
                    aria-label="Schedule interval value"
                    onOpenChange={registerFrequencyMenuOpen}
                    onChange={(value) => setIntervalValue(Number(value))}
                  />
                  <CardDropdown
                    className={styles.unitDropdown}
                    variant="console"
                    value={intervalUnit}
                    options={UNIT_OPTIONS}
                    aria-label="Schedule interval unit"
                    onOpenChange={registerFrequencyMenuOpen}
                    onChange={(value) => handleIntervalUnitChange(value as ScheduleIntervalUnit)}
                  />
                </div>
              </div>

              {action === "run_command" && (
                <label className={form.field}>
                  <span className={form.fieldLabel}>Console command</span>
                  <input
                    value={command}
                    onChange={(event) => setCommand(event.target.value)}
                    placeholder="save-all"
                    spellCheck={false}
                    autoComplete="off"
                    required
                  />
                </label>
              )}

              <div className={form.actions}>
                <button type="submit" className={form.actionPrimary} disabled={saving}>
                  {saving ? "Adding…" : "Add Schedule"}
                </button>
              </div>
            </form>
          </ConsoleCard>
        )}
      </PageContent>
    </PageShell>
  );
}
