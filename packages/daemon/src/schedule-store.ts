import path from "node:path";
import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import type {
  ApplicationType,
  AuditAction,
  InstanceProcessConfig,
  InstanceSchedule,
  InstanceStatus,
} from "@stackpatch/shared";
import {
  AUDIT_LOG_LIMIT,
  getApplicationTypeDefinition,
  normalizeApplicationType,
  isScheduleAction,
  isScheduleIntervalUnit,
  resolveDataDir,
} from "@stackpatch/shared";

interface InstanceRow {
  id: string;
  name: string;
  executable_path: string;
  arguments: string;
  working_directory: string;
  auto_restart: number;
  max_restart_retries: number;
  stop_command: string;
  application_type: string;
  memory_limit_mb: number | null;
  cpu_limit_percent: number | null;
}

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

function openDatabase(): DatabaseSync {
  const dbPath = path.join(resolveDataDir(), "stackpatch.db");
  return new DatabaseSync(dbPath, { readOnly: true });
}

function mapSchedule(row: ScheduleRow): InstanceSchedule {
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

function mapApplicationType(value: string): ApplicationType {
  return normalizeApplicationType(value);
}

export function loadEnabledSchedules(): InstanceSchedule[] {
  const database = openDatabase();
  try {
    const rows = database
      .prepare(
        `SELECT id, instance_id, action, interval_value, interval_unit, enabled, command, created_at, updated_at
         FROM instance_schedules
         WHERE enabled = 1
         ORDER BY created_at ASC`,
      )
      .all() as unknown as ScheduleRow[];

    return rows.map(mapSchedule);
  } finally {
    database.close();
  }
}

export function loadInstanceProcessConfig(instanceId: string): {
  config: InstanceProcessConfig;
  name: string;
} | null {
  const database = openDatabase();
  try {
    const row = database
      .prepare(
        `SELECT id, name, executable_path, arguments, working_directory, auto_restart,
                max_restart_retries, stop_command, application_type, memory_limit_mb, cpu_limit_percent
         FROM instances
         WHERE id = ?`,
      )
      .get(instanceId) as InstanceRow | undefined;

    if (!row) {
      return null;
    }

    const applicationType = mapApplicationType(row.application_type);

    return {
      name: row.name,
      config: {
        applicationType,
        executablePath: row.executable_path,
        arguments: row.arguments,
        workingDirectory: row.working_directory,
        autoRestart: row.auto_restart === 1,
        maxRestartRetries: row.max_restart_retries,
        stopCommand:
          row.stop_command || getApplicationTypeDefinition(applicationType).defaultStopCommand,
        memoryLimitMb: row.memory_limit_mb,
        cpuLimitPercent: row.cpu_limit_percent,
      },
    };
  } finally {
    database.close();
  }
}

export function loadInstanceStatus(instanceId: string): InstanceStatus {
  const database = openDatabase();
  try {
    const row = database
      .prepare("SELECT status FROM instances WHERE id = ?")
      .get(instanceId) as { status: InstanceStatus } | undefined;

    return row?.status ?? "stopped";
  } finally {
    database.close();
  }
}

export function insertSystemAuditLog(
  action: AuditAction,
  message: string,
  instanceId: string | null,
  instanceName: string | null,
): void {
  const database = new DatabaseSync(path.join(resolveDataDir(), "stackpatch.db"));
  try {
    const id = randomUUID();
    const createdAt = new Date().toISOString();

    database
      .prepare(
        `INSERT INTO audit_logs (
          id, user_id, username, action, instance_id, instance_name, message, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(id, null, "system", action, instanceId, instanceName, message, createdAt);

    database
      .prepare(
        `DELETE FROM audit_logs
         WHERE id NOT IN (
           SELECT id FROM audit_logs ORDER BY created_at DESC LIMIT ?
         )`,
      )
      .run(AUDIT_LOG_LIMIT);
  } finally {
    database.close();
  }
}
