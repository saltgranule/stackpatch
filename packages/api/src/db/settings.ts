import {
  DEFAULT_DAEMON_IPC_PORT,
  DEFAULT_MAX_UPLOAD_FILE_SIZE_MB,
  DEFAULT_PANEL_PORT,
  isValidMaxUploadFileSizeMb,
  isValidPort,
  type SystemSettings,
} from "@stackpatch/shared";
import { getDatabase } from "./database.js";

function getSetting(key: string): string | null {
  const database = getDatabase();
  const row = database
    .prepare("SELECT value FROM system_settings WHERE key = ?")
    .get(key) as { value: string } | undefined;
  return row?.value ?? null;
}

function setSetting(key: string, value: string): void {
  const database = getDatabase();
  database
    .prepare(
      `INSERT INTO system_settings (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    )
    .run(key, value);
}

function parsePort(value: string | null, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number(value);
  return isValidPort(parsed) ? parsed : fallback;
}

function parseMaxUploadFileSizeMb(value: string | null, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number(value);
  return isValidMaxUploadFileSizeMb(parsed) ? parsed : fallback;
}

export function getSystemSettings(): SystemSettings {
  return {
    panelPort: parsePort(getSetting("panel_port"), DEFAULT_PANEL_PORT),
    daemonPort: parsePort(getSetting("daemon_port"), DEFAULT_DAEMON_IPC_PORT),
    maxUploadFileSizeMb: parseMaxUploadFileSizeMb(
      getSetting("max_upload_file_size_mb"),
      DEFAULT_MAX_UPLOAD_FILE_SIZE_MB,
    ),
  };
}

export interface UpdateSystemSettingsInput {
  panelPort?: number;
  daemonPort?: number;
  maxUploadFileSizeMb?: number;
}

export function updateSystemSettings(input: UpdateSystemSettingsInput): SystemSettings {
  if (input.panelPort !== undefined) {
    if (!isValidPort(input.panelPort)) {
      throw new Error("Panel port must be between 1 and 65535");
    }
    setSetting("panel_port", String(input.panelPort));
  }

  if (input.daemonPort !== undefined) {
    if (!isValidPort(input.daemonPort)) {
      throw new Error("Daemon port must be between 1 and 65535");
    }
    setSetting("daemon_port", String(input.daemonPort));
  }

  if (input.maxUploadFileSizeMb !== undefined) {
    if (!isValidMaxUploadFileSizeMb(input.maxUploadFileSizeMb)) {
      throw new Error("Max upload file size must be between 1 and 2048 MB");
    }
    setSetting("max_upload_file_size_mb", String(input.maxUploadFileSizeMb));
  }

  return getSystemSettings();
}
