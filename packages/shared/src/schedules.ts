export const SCHEDULE_ACTIONS = [
  "start",
  "stop",
  "restart",
  "run_command",
  "backup",
] as const;

export type ScheduleAction = (typeof SCHEDULE_ACTIONS)[number];

export const SCHEDULE_INTERVAL_UNITS = ["minutes", "hours", "days"] as const;

export type ScheduleIntervalUnit = (typeof SCHEDULE_INTERVAL_UNITS)[number];

export const SCHEDULE_INTERVAL_LIMITS: Record<
  ScheduleIntervalUnit,
  { min: number; max: number }
> = {
  minutes: { min: 1, max: 60 },
  hours: { min: 1, max: 48 },
  days: { min: 1, max: 30 },
};

export interface InstanceSchedule {
  id: string;
  instanceId: string;
  action: ScheduleAction;
  intervalValue: number;
  intervalUnit: ScheduleIntervalUnit;
  enabled: boolean;
  command: string | null;
  createdAt: string;
  updatedAt: string;
}

export function isScheduleAction(value: string): value is ScheduleAction {
  return (SCHEDULE_ACTIONS as readonly string[]).includes(value);
}

export function isScheduleIntervalUnit(value: string): value is ScheduleIntervalUnit {
  return (SCHEDULE_INTERVAL_UNITS as readonly string[]).includes(value);
}

export function isValidScheduleInterval(
  value: number,
  unit: ScheduleIntervalUnit,
): boolean {
  if (!Number.isInteger(value)) {
    return false;
  }

  const limits = SCHEDULE_INTERVAL_LIMITS[unit];
  return value >= limits.min && value <= limits.max;
}

export function clampScheduleInterval(
  value: number,
  unit: ScheduleIntervalUnit,
): number {
  const limits = SCHEDULE_INTERVAL_LIMITS[unit];
  return Math.min(Math.max(value, limits.min), limits.max);
}

export function buildScheduleIntervalOptions(unit: ScheduleIntervalUnit): number[] {
  const limits = SCHEDULE_INTERVAL_LIMITS[unit];
  return Array.from(
    { length: limits.max - limits.min + 1 },
    (_, index) => limits.min + index,
  );
}

export function formatScheduleAction(action: ScheduleAction): string {
  switch (action) {
    case "start":
      return "Start";
    case "stop":
      return "Stop";
    case "restart":
      return "Restart";
    case "run_command":
      return "Run Command";
    case "backup":
      return "Backup";
  }
}

export function formatScheduleIntervalUnit(unit: ScheduleIntervalUnit): string {
  switch (unit) {
    case "minutes":
      return "minutes";
    case "hours":
      return "hours";
    case "days":
      return "days";
  }
}

export function describeScheduleInterval(
  value: number,
  unit: ScheduleIntervalUnit,
): string {
  if (!isValidScheduleInterval(value, unit)) {
    return `Every ${value} ${formatScheduleIntervalUnit(unit)}`;
  }

  switch (unit) {
    case "minutes":
      return value === 1 ? "Every minute" : `Every ${value} minutes`;
    case "hours":
      return value === 1 ? "Every hour" : `Every ${value} hours`;
    case "days":
      return value === 1 ? "Every day" : `Every ${value} days`;
  }
}

export function scheduleIntervalToMs(
  value: number,
  unit: ScheduleIntervalUnit,
): number {
  switch (unit) {
    case "minutes":
      return value * 60 * 1000;
    case "hours":
      return value * 60 * 60 * 1000;
    case "days":
      return value * 24 * 60 * 60 * 1000;
  }
}

export function parseLegacyCronIntervalHours(cron: string): number {
  const trimmed = cron.trim();
  const hourly = trimmed.match(/^0 \* \* \* \*$/);
  if (hourly) {
    return 1;
  }

  const everyNHours = trimmed.match(/^0 \*\/(\d+) \* \* \*$/);
  if (everyNHours) {
    const parsed = Number(everyNHours[1]);
    if (isValidScheduleInterval(parsed, "hours")) {
      return parsed;
    }
  }

  return 24;
}

export function isIntervalDue(
  value: number,
  unit: ScheduleIntervalUnit,
  now: Date,
  lastFiredAt: Date | null,
  anchor: Date,
): boolean {
  if (!isValidScheduleInterval(value, unit)) {
    return false;
  }

  const intervalMs = scheduleIntervalToMs(value, unit);
  const since = lastFiredAt ?? anchor;
  return now.getTime() - since.getTime() >= intervalMs;
}
