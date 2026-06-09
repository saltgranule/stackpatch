import fs from "node:fs";
import { config } from "../config.js";
import { getDaemonClient } from "./daemon-client.js";
const HEARTBEAT_MAX_AGE_MS = 15_000;

export function isDaemonConnected(): boolean {
  try {
    if (!fs.existsSync(config.daemonSocketPath)) {
      return false;
    }

    const raw = fs.readFileSync(config.daemonSocketPath, "utf8");
    const parsed = JSON.parse(raw) as unknown;

    if (
      typeof parsed !== "object" ||
      parsed === null ||
      !("ts" in parsed) ||
      typeof (parsed as Record<string, unknown>).ts !== "number"
    ) {
      return true;
    }

    const age = Date.now() - (parsed as { ts: number }).ts;
    return age < HEARTBEAT_MAX_AGE_MS;
  } catch {
    return false;
  }
}

export async function isDaemonResponsive(): Promise<boolean> {
  if (!isDaemonConnected()) {
    return false;
  }

  try {
    await getDaemonClient().ping();
    return true;
  } catch {
    return false;
  }
}