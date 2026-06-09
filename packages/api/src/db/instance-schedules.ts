import { v4 as uuid } from "uuid";
import type { InstanceSchedule, ScheduleAction, ScheduleIntervalUnit } from "@stackpatch/shared";
import { isScheduleAction, isScheduleIntervalUnit } from "@stackpatch/shared";
import { getDatabase } from "./database.js";

interface ScheduleRow {
  id: string;
  instance_id: string;
  action: string;
  interval_value: number;
  interval_unit: string;
  enabled: number;
  command: string | null;
  created_at: string;
  updated_at: string;
}

function mapRow(row: ScheduleRow): InstanceSchedule {
  return {
    id: row.id,
    instanceId: row.instance_id,
    action: isScheduleAction(row.action) ? row.action : "start",
    intervalValue: row.interval_value,
    intervalUnit: isScheduleIntervalUnit(row.interval_unit) ? row.interval_unit : "hours",
    enabled: row.enabled === 1,
    command: row.command,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function listSchedulesForInstance(instanceId: string): InstanceSchedule[] {
  const database = getDatabase();
  const rows = database
    .prepare(
      `SELECT id, instance_id, action, interval_value, interval_unit, enabled, command, created_at, updated_at
       FROM instance_schedules
       WHERE instance_id = ?
       ORDER BY created_at ASC`,
    )
    .all(instanceId) as unknown as ScheduleRow[];

  return rows.map(mapRow);
}

export function getScheduleById(instanceId: string, scheduleId: string): InstanceSchedule | null {
  const database = getDatabase();
  const row = database
    .prepare(
      `SELECT id, instance_id, action, interval_value, interval_unit, enabled, command, created_at, updated_at
       FROM instance_schedules
       WHERE instance_id = ? AND id = ?`,
    )
    .get(instanceId, scheduleId) as ScheduleRow | undefined;

  return row ? mapRow(row) : null;
}

export interface CreateScheduleInput {
  instanceId: string;
  action: ScheduleAction;
  intervalValue: number;
  intervalUnit: ScheduleIntervalUnit;
  enabled?: boolean;
  command?: string | null;
}

export function createSchedule(input: CreateScheduleInput): InstanceSchedule {
  const database = getDatabase();
  const id = uuid();
  const now = new Date().toISOString();

  database
    .prepare(
      `INSERT INTO instance_schedules (
        id, instance_id, action, interval_value, interval_unit, enabled, command, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      id,
      input.instanceId,
      input.action,
      input.intervalValue,
      input.intervalUnit,
      input.enabled === false ? 0 : 1,
      input.command?.trim() || null,
      now,
      now,
    );

  return getScheduleById(input.instanceId, id)!;
}

export interface UpdateScheduleInput {
  action?: ScheduleAction;
  intervalValue?: number;
  intervalUnit?: ScheduleIntervalUnit;
  enabled?: boolean;
  command?: string | null;
}

export function updateSchedule(
  instanceId: string,
  scheduleId: string,
  input: UpdateScheduleInput,
): InstanceSchedule | null {
  const existing = getScheduleById(instanceId, scheduleId);
  if (!existing) {
    return null;
  }

  const database = getDatabase();
  const now = new Date().toISOString();

  database
    .prepare(
      `UPDATE instance_schedules
       SET action = ?, interval_value = ?, interval_unit = ?, enabled = ?, command = ?, updated_at = ?
       WHERE id = ? AND instance_id = ?`,
    )
    .run(
      input.action ?? existing.action,
      input.intervalValue ?? existing.intervalValue,
      input.intervalUnit ?? existing.intervalUnit,
      input.enabled === undefined ? (existing.enabled ? 1 : 0) : input.enabled ? 1 : 0,
      input.command === undefined ? existing.command : input.command?.trim() || null,
      now,
      scheduleId,
      instanceId,
    );

  return getScheduleById(instanceId, scheduleId);
}

export function deleteSchedule(instanceId: string, scheduleId: string): boolean {
  const database = getDatabase();
  const result = database
    .prepare("DELETE FROM instance_schedules WHERE id = ? AND instance_id = ?")
    .run(scheduleId, instanceId);

  return result.changes > 0;
}
