import type { ApplicationType, Instance, InstanceProcessConfig, InstanceStatus } from "@stackpatch/shared";
import {
  DEFAULT_APPLICATION_TYPE,
  DEFAULT_STOP_COMMAND,
  formatStartupCommand,
  getApplicationTypeDefinition,
  isApplicationType,
} from "@stackpatch/shared";
import { getDatabase } from "./database.js";

interface InstanceRow {
  id: string;
  name: string;
  executable_path: string;
  arguments: string;
  working_directory: string;
  memory_limit_mb: number | null;
  auto_restart: number;
  max_restart_retries: number;
  stop_command: string;
  application_type: string;
  status: InstanceStatus;
  pid: number | null;
  last_started_at: string | null;
  created_at: string;
  updated_at: string;
}

function mapApplicationType(value: string): ApplicationType {
  return isApplicationType(value) ? value : DEFAULT_APPLICATION_TYPE;
}

function mapRow(row: InstanceRow): Instance {
  const applicationType = mapApplicationType(row.application_type);

  return {
    id: row.id,
    name: row.name,
    applicationType,
    executablePath: row.executable_path,
    arguments: row.arguments,
    startupCommand: formatStartupCommand(row.executable_path, row.arguments),
    workingDirectory: row.working_directory,
    memoryLimitMb: row.memory_limit_mb,
    autoRestart: row.auto_restart === 1,
    maxRestartRetries: row.max_restart_retries,
    stopCommand: row.stop_command || getApplicationTypeDefinition(applicationType).defaultStopCommand,
    status: row.status,
    pid: row.pid,
    lastStartedAt: row.last_started_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function listInstances(): Instance[] {
  const database = getDatabase();
  const rows = database
    .prepare("SELECT * FROM instances ORDER BY created_at DESC")
    .all() as unknown as InstanceRow[];
  return rows.map(mapRow);
}

export function getInstanceById(id: string): Instance | null {
  const database = getDatabase();
  const row = database
    .prepare("SELECT * FROM instances WHERE id = ?")
    .get(id) as InstanceRow | undefined;
  return row ? mapRow(row) : null;
}

export function toProcessConfig(instance: Instance): InstanceProcessConfig {
  return {
    applicationType: instance.applicationType,
    executablePath: instance.executablePath,
    arguments: instance.arguments,
    workingDirectory: instance.workingDirectory,
    autoRestart: instance.autoRestart,
    maxRestartRetries: instance.maxRestartRetries,
    stopCommand: instance.stopCommand || DEFAULT_STOP_COMMAND,
  };
}

export function updateInstanceRuntime(
  id: string,
  status: InstanceStatus,
  pid: number | null,
  startedAt?: string | null,
): Instance | null {
  const existing = getInstanceById(id);
  if (!existing) {
    return null;
  }

  const nextStartedAt = startedAt ?? existing.lastStartedAt;
  if (
    existing.status === status &&
    existing.pid === pid &&
    existing.lastStartedAt === nextStartedAt
  ) {
    return existing;
  }

  const database = getDatabase();
  const now = new Date().toISOString();

  database
    .prepare(
      `UPDATE instances
       SET status = ?, pid = ?, updated_at = ?, last_started_at = COALESCE(?, last_started_at)
       WHERE id = ?`,
    )
    .run(status, pid, now, startedAt ?? null, id);

  return getInstanceById(id);
}

export interface CreateInstanceInput {
  name: string;
  applicationType?: ApplicationType;
  executablePath: string;
  arguments?: string;
  workingDirectory: string;
  memoryLimitMb?: number | null;
  autoRestart?: boolean;
  maxRestartRetries?: number;
  stopCommand?: string;
}

export interface UpdateInstanceInput {
  name?: string;
  applicationType?: ApplicationType;
  executablePath?: string;
  arguments?: string;
  workingDirectory?: string;
  autoRestart?: boolean;
  maxRestartRetries?: number;
  stopCommand?: string;
}

function resolveStopCommand(
  applicationType: ApplicationType,
  stopCommand: string | undefined,
): string {
  const trimmed = stopCommand?.trim();
  if (trimmed !== undefined) {
    return trimmed;
  }
  return getApplicationTypeDefinition(applicationType).defaultStopCommand;
}

export function createInstance(id: string, input: CreateInstanceInput): Instance {
  const database = getDatabase();
  const now = new Date().toISOString();
  const applicationType = input.applicationType ?? DEFAULT_APPLICATION_TYPE;

  database
    .prepare(
      `INSERT INTO instances (
        id, name, application_type, executable_path, arguments, working_directory,
        memory_limit_mb, auto_restart, max_restart_retries, stop_command, status, pid,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'stopped', NULL, ?, ?)`,
    )
    .run(
      id,
      input.name,
      applicationType,
      input.executablePath,
      input.arguments ?? "",
      input.workingDirectory,
      input.memoryLimitMb ?? null,
      input.autoRestart ? 1 : 0,
      input.maxRestartRetries ?? 3,
      resolveStopCommand(applicationType, input.stopCommand),
      now,
      now,
    );

  return getInstanceById(id)!;
}

export function updateInstance(id: string, input: UpdateInstanceInput): Instance | null {
  const existing = getInstanceById(id);
  if (!existing) {
    return null;
  }

  const database = getDatabase();
  const now = new Date().toISOString();
  const applicationType = input.applicationType ?? existing.applicationType;
  const nextStopCommand =
    input.stopCommand !== undefined
      ? resolveStopCommand(applicationType, input.stopCommand)
      : input.applicationType !== undefined
        ? resolveStopCommand(applicationType, existing.stopCommand)
        : existing.stopCommand;

  database
    .prepare(
      `UPDATE instances SET
        name = ?,
        application_type = ?,
        executable_path = ?,
        arguments = ?,
        working_directory = ?,
        auto_restart = ?,
        max_restart_retries = ?,
        stop_command = ?,
        updated_at = ?
      WHERE id = ?`,
    )
    .run(
      input.name ?? existing.name,
      applicationType,
      input.executablePath ?? existing.executablePath,
      input.arguments ?? existing.arguments,
      input.workingDirectory ?? existing.workingDirectory,
      (input.autoRestart ?? existing.autoRestart) ? 1 : 0,
      input.maxRestartRetries ?? existing.maxRestartRetries,
      nextStopCommand,
      now,
      id,
    );

  return getInstanceById(id);
}

export function deleteInstance(id: string): boolean {
  const database = getDatabase();
  const result = database.prepare("DELETE FROM instances WHERE id = ?").run(id);
  return result.changes > 0;
}
