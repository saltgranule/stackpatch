import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { DEFAULT_DAEMON_IPC_PORT, isValidPort, resolveDataDir } from "@stackpatch/shared";

export function resolveDaemonPort(): number {
  const envPort = process.env.STACKPATCH_DAEMON_PORT;
  if (envPort) {
    const parsed = Number(envPort);
    if (isValidPort(parsed)) {
      return parsed;
    }
  }

  const dbPath = path.join(resolveDataDir(), "stackpatch.db");
  try {
    const database = new DatabaseSync(dbPath, { readOnly: true });
    const row = database
      .prepare("SELECT value FROM system_settings WHERE key = ?")
      .get("daemon_port") as { value: string } | undefined;
    database.close();

    if (row?.value) {
      const parsed = Number(row.value);
      if (isValidPort(parsed)) {
        return parsed;
      }
    }
  } catch {
    // Database may not exist on first boot.
  }

  return DEFAULT_DAEMON_IPC_PORT;
}
