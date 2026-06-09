import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import { DEFAULT_DAEMON_IPC_PORT, DEFAULT_PANEL_PORT, parseLegacyCronIntervalHours } from "@stackpatch/shared";
import { config } from "../config.js";

let db: DatabaseSync | null = null;

export function getDatabase(): DatabaseSync {
  if (db) {
    return db;
  }

  fs.mkdirSync(config.dataDir, { recursive: true });

  db = new DatabaseSync(config.dbPath);
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA foreign_keys = ON");

  const schemaPath = path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    "schema.sql",
  );
  db.exec(fs.readFileSync(schemaPath, "utf-8"));
  migrate(db);
  seedDefaults(db);
  migrateLegacyPorts(db);

  return db;
}

function migrate(database: DatabaseSync): void {
  const instanceColumns = database.prepare("PRAGMA table_info(instances)").all() as Array<{
    name: string;
  }>;

  if (!instanceColumns.some((column) => column.name === "pid")) {
    database.exec("ALTER TABLE instances ADD COLUMN pid INTEGER");
  }

  if (!instanceColumns.some((column) => column.name === "last_started_at")) {
    database.exec("ALTER TABLE instances ADD COLUMN last_started_at TEXT");
  }

  const userColumns = database.prepare("PRAGMA table_info(users)").all() as Array<{
    name: string;
  }>;

  if (!userColumns.some((column) => column.name === "role")) {
    database.exec(
      "ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'admin' CHECK (role IN ('admin', 'viewer'))",
    );
  }

  if (!userColumns.some((column) => column.name === "last_login_at")) {
    database.exec("ALTER TABLE users ADD COLUMN last_login_at TEXT");
  }

  if (!userColumns.some((column) => column.name === "display_password")) {
    database.exec("ALTER TABLE users ADD COLUMN display_password TEXT");
  }

  if (!instanceColumns.some((column) => column.name === "stop_command")) {
    database.exec("ALTER TABLE instances ADD COLUMN stop_command TEXT NOT NULL DEFAULT 'stop'");
  }

  if (!instanceColumns.some((column) => column.name === "application_type")) {
    database.exec(
      "ALTER TABLE instances ADD COLUMN application_type TEXT NOT NULL DEFAULT 'minecraft'",
    );
  }

  migrateInstanceStoppingStatus(database);
  migrateApplicationTypeGeneric(database);
  migrateAuditLogs(database);
  migrateRemoveOperatorRole(database);
  migrateInstanceSchedules(database);
  migrateScheduleIntervalHours(database);
  migrateScheduleIntervalUnits(database);
}

function migrateInstanceSchedules(database: DatabaseSync): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS instance_schedules (
      id TEXT PRIMARY KEY,
      instance_id TEXT NOT NULL REFERENCES instances(id) ON DELETE CASCADE,
      action TEXT NOT NULL CHECK (action IN ('start', 'stop', 'restart', 'run_command', 'backup')),
      cron TEXT,
      timezone TEXT,
      interval_hours INTEGER,
      enabled INTEGER NOT NULL DEFAULT 1,
      command TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_instance_schedules_instance ON instance_schedules(instance_id);
  `);
}

function migrateScheduleIntervalHours(database: DatabaseSync): void {
  const columns = database.prepare("PRAGMA table_info(instance_schedules)").all() as Array<{
    name: string;
  }>;

  if (columns.length === 0) {
    return;
  }

  if (!columns.some((column) => column.name === "interval_hours")) {
    database.exec("ALTER TABLE instance_schedules ADD COLUMN interval_hours INTEGER");
  }

  const hasCron = columns.some((column) => column.name === "cron");
  const rows = database
    .prepare(
      hasCron
        ? "SELECT id, cron, interval_hours FROM instance_schedules"
        : "SELECT id, interval_hours FROM instance_schedules",
    )
    .all() as Array<{ id: string; cron?: string | null; interval_hours: number | null }>;

  const update = database.prepare(
    "UPDATE instance_schedules SET interval_hours = ? WHERE id = ?",
  );

  for (const row of rows) {
    if (row.interval_hours !== null && row.interval_hours >= 1 && row.interval_hours <= 48) {
      continue;
    }

    const hours = row.cron ? parseLegacyCronIntervalHours(row.cron) : 24;
    update.run(hours, row.id);
  }

  database.exec(
    "UPDATE instance_schedules SET interval_hours = 24 WHERE interval_hours IS NULL OR interval_hours < 1 OR interval_hours > 48",
  );
}

function migrateScheduleIntervalUnits(database: DatabaseSync): void {
  const columns = database.prepare("PRAGMA table_info(instance_schedules)").all() as Array<{
    name: string;
  }>;

  if (columns.length === 0) {
    return;
  }

  if (!columns.some((column) => column.name === "interval_value")) {
    database.exec("ALTER TABLE instance_schedules ADD COLUMN interval_value INTEGER");
  }

  if (!columns.some((column) => column.name === "interval_unit")) {
    database.exec("ALTER TABLE instance_schedules ADD COLUMN interval_unit TEXT");
  }

  const hasIntervalHours = columns.some((column) => column.name === "interval_hours");
  const rows = database
    .prepare(
      hasIntervalHours
        ? "SELECT id, interval_hours, interval_value, interval_unit FROM instance_schedules"
        : "SELECT id, interval_value, interval_unit FROM instance_schedules",
    )
    .all() as Array<{
      id: string;
      interval_hours?: number | null;
      interval_value: number | null;
      interval_unit: string | null;
    }>;

  const update = database.prepare(
    "UPDATE instance_schedules SET interval_value = ?, interval_unit = ? WHERE id = ?",
  );

  for (const row of rows) {
    if (
      row.interval_value !== null &&
      row.interval_value >= 1 &&
      row.interval_unit !== null &&
      (row.interval_unit === "minutes" ||
        row.interval_unit === "hours" ||
        row.interval_unit === "days")
    ) {
      continue;
    }

    const value = row.interval_hours ?? row.interval_value ?? 24;
    update.run(value, "hours", row.id);
  }

  database.exec(`
    UPDATE instance_schedules
    SET interval_value = 24, interval_unit = 'hours'
    WHERE interval_value IS NULL
       OR interval_value < 1
       OR interval_unit IS NULL
       OR interval_unit NOT IN ('minutes', 'hours', 'days')
  `);
}

function migrateRemoveOperatorRole(database: DatabaseSync): void {
  database.exec("UPDATE users SET role = 'viewer' WHERE role = 'operator'");
  database.exec("UPDATE instance_permissions SET role = 'viewer' WHERE role = 'operator'");
}

function migrateAuditLogs(database: DatabaseSync): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS audit_logs (
      id TEXT PRIMARY KEY,
      user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      username TEXT NOT NULL,
      action TEXT NOT NULL,
      instance_id TEXT,
      instance_name TEXT,
      message TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs(created_at);
  `);
}

function migrateApplicationTypeGeneric(database: DatabaseSync): void {
  const table = database
    .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'instances'")
    .get() as { sql?: string } | undefined;

  const sql = table?.sql ?? "";
  if (!sql.includes("application_type") || sql.includes("'generic'")) {
    return;
  }

  database.exec("PRAGMA foreign_keys = OFF");
  database.exec(`
    CREATE TABLE instances__generic_migration (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      executable_path TEXT NOT NULL,
      arguments TEXT NOT NULL DEFAULT '',
      working_directory TEXT NOT NULL,
      memory_limit_mb INTEGER,
      auto_restart INTEGER NOT NULL DEFAULT 0,
      max_restart_retries INTEGER NOT NULL DEFAULT 3,
      stop_command TEXT NOT NULL DEFAULT 'stop',
      application_type TEXT NOT NULL DEFAULT 'minecraft' CHECK (application_type IN ('python', 'javascript', 'go', 'minecraft', 'generic')),
      status TEXT NOT NULL DEFAULT 'stopped' CHECK (status IN ('running', 'stopped', 'crashed', 'starting', 'stopping')),
      pid INTEGER,
      last_started_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    INSERT INTO instances__generic_migration (
      id, name, executable_path, arguments, working_directory,
      memory_limit_mb, auto_restart, max_restart_retries, stop_command,
      application_type, status, pid, last_started_at, created_at, updated_at
    )
    SELECT
      id, name, executable_path, arguments, working_directory,
      memory_limit_mb, auto_restart, max_restart_retries, stop_command,
      application_type, status, pid, last_started_at, created_at, updated_at
    FROM instances;

    DROP TABLE instances;
    ALTER TABLE instances__generic_migration RENAME TO instances;
  `);
  database.exec("PRAGMA foreign_keys = ON");
}

function migrateInstanceStoppingStatus(database: DatabaseSync): void {
  const table = database
    .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'instances'")
    .get() as { sql?: string } | undefined;

  if (table?.sql?.includes("'stopping'")) {
    return;
  }

  database.exec("PRAGMA foreign_keys = OFF");
  database.exec(`
    CREATE TABLE instances__stopping_migration (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      executable_path TEXT NOT NULL,
      arguments TEXT NOT NULL DEFAULT '',
      working_directory TEXT NOT NULL,
      memory_limit_mb INTEGER,
      auto_restart INTEGER NOT NULL DEFAULT 0,
      max_restart_retries INTEGER NOT NULL DEFAULT 3,
      stop_command TEXT NOT NULL DEFAULT 'stop',
      application_type TEXT NOT NULL DEFAULT 'minecraft',
      status TEXT NOT NULL DEFAULT 'stopped' CHECK (status IN ('running', 'stopped', 'crashed', 'starting', 'stopping')),
      pid INTEGER,
      last_started_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    INSERT INTO instances__stopping_migration (
      id, name, executable_path, arguments, working_directory,
      memory_limit_mb, auto_restart, max_restart_retries, stop_command,
      application_type, status, pid, last_started_at, created_at, updated_at
    )
    SELECT
      id, name, executable_path, arguments, working_directory,
      memory_limit_mb, auto_restart, max_restart_retries, stop_command,
      application_type, status, pid, last_started_at, created_at, updated_at
    FROM instances;

    DROP TABLE instances;
    ALTER TABLE instances__stopping_migration RENAME TO instances;
  `);
  database.exec("PRAGMA foreign_keys = ON");
}

function seedDefaults(database: DatabaseSync): void {
  const insertSetting = database.prepare(
    "INSERT OR IGNORE INTO system_settings (key, value) VALUES (?, ?)",
  );
  insertSetting.run("panel_port", String(DEFAULT_PANEL_PORT));
  insertSetting.run("daemon_port", String(DEFAULT_DAEMON_IPC_PORT));
}

/** Upgrade databases created before M5 default ports. */
function migrateLegacyPorts(database: DatabaseSync): void {
  const updateSetting = database.prepare(
    "UPDATE system_settings SET value = ? WHERE key = ? AND value = ?",
  );
  updateSetting.run(String(DEFAULT_PANEL_PORT), "panel_port", "8080");
  updateSetting.run(String(DEFAULT_DAEMON_IPC_PORT), "daemon_port", "8081");
}

export function closeDatabase(): void {
  if (db) {
    db.close();
    db = null;
  }
}
