CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'viewer' CHECK (role IN ('admin', 'viewer')),
  theme TEXT NOT NULL DEFAULT 'system' CHECK (theme IN ('light', 'dark', 'system')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS instances (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  executable_path TEXT NOT NULL,
  arguments TEXT NOT NULL DEFAULT '',
  working_directory TEXT NOT NULL,
  memory_limit_mb INTEGER,
  cpu_limit_percent INTEGER,
  auto_restart INTEGER NOT NULL DEFAULT 0,
  max_restart_retries INTEGER NOT NULL DEFAULT 3,
  stop_command TEXT NOT NULL DEFAULT 'stop',
  application_type TEXT NOT NULL DEFAULT 'minecraft:paper' CHECK (application_type IN ('python', 'nodejs', 'java', 'generic', 'minecraft:vanilla', 'minecraft:paper', 'minecraft:folia', 'minecraft:fabric', 'minecraft:forge', 'minecraft:neoforge', 'minecraft:purpur', 'minecraft:bungeecord', 'minecraft:velocity')),
  status TEXT NOT NULL DEFAULT 'stopped' CHECK (status IN ('running', 'stopped', 'crashed', 'starting', 'stopping')),
  pid INTEGER,
  last_started_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS instance_permissions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  instance_id TEXT NOT NULL REFERENCES instances(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('admin', 'viewer')),
  UNIQUE (user_id, instance_id)
);

CREATE TABLE IF NOT EXISTS system_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  session_id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  expires_at TEXT NOT NULL,
  data TEXT NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_instance_permissions_user ON instance_permissions(user_id);
CREATE INDEX IF NOT EXISTS idx_instance_permissions_instance ON instance_permissions(instance_id);

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

CREATE TABLE IF NOT EXISTS instance_schedules (
  id TEXT PRIMARY KEY,
  instance_id TEXT NOT NULL REFERENCES instances(id) ON DELETE CASCADE,
  action TEXT NOT NULL CHECK (action IN ('start', 'stop', 'restart', 'run_command', 'backup')),
  interval_value INTEGER NOT NULL DEFAULT 24 CHECK (interval_value >= 1),
  interval_unit TEXT NOT NULL DEFAULT 'hours' CHECK (interval_unit IN ('minutes', 'hours', 'days')),
  enabled INTEGER NOT NULL DEFAULT 1,
  command TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_instance_schedules_instance ON instance_schedules(instance_id);
