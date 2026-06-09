import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const DEFAULT_PANEL_PORT = 23333;
const DEFAULT_DAEMON_IPC_PORT = 24444;

function parsePort(value, fallback) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
    return fallback;
  }
  return parsed;
}

function readSetting(database, key) {
  const row = database
    .prepare("SELECT value FROM system_settings WHERE key = ?")
    .get(key);
  return row?.value ?? null;
}

export function readSystemPorts(root) {
  const dataDir = process.env.STACKPATCH_DATA_DIR ?? path.join(root, ".data");
  const dbPath = path.join(dataDir, "stackpatch.db");

  let panelPort = DEFAULT_PANEL_PORT;
  let daemonPort = DEFAULT_DAEMON_IPC_PORT;

  if (fs.existsSync(dbPath)) {
    try {
      const database = new DatabaseSync(dbPath, { readOnly: true });
      panelPort = parsePort(readSetting(database, "panel_port"), DEFAULT_PANEL_PORT);
      daemonPort = parsePort(readSetting(database, "daemon_port"), DEFAULT_DAEMON_IPC_PORT);
      database.close();
    } catch {
      // Database may not exist yet on first boot.
    }
  }

  if (process.env.STACKPATCH_PORT) {
    panelPort = parsePort(process.env.STACKPATCH_PORT, panelPort);
  }

  if (process.env.STACKPATCH_DAEMON_PORT) {
    daemonPort = parsePort(process.env.STACKPATCH_DAEMON_PORT, daemonPort);
  }

  return { panelPort, daemonPort };
}
