import fs from "node:fs";
import path from "node:path";
import type { LogLine } from "@stackpatch/shared";
import { daemonConfig } from "./config.js";

const logsDir = path.join(daemonConfig.dataDir, "console-logs");

function logFilePath(instanceId: string): string {
  return path.join(logsDir, `${instanceId}.json`);
}

export function loadPersistedLogs(instanceId: string, maxLines: number): LogLine[] {
  try {
    const raw = fs.readFileSync(logFilePath(instanceId), "utf8");
    const lines = JSON.parse(raw) as LogLine[];
    if (!Array.isArray(lines)) {
      return [];
    }
    return lines.slice(-maxLines);
  } catch {
    return [];
  }
}

export function appendPersistedLogs(
  instanceId: string,
  lines: LogLine[],
  maxLines: number,
): void {
  if (lines.length === 0) {
    return;
  }

  fs.mkdirSync(logsDir, { recursive: true });
  const existing = loadPersistedLogs(instanceId, maxLines);
  const merged = [...existing, ...lines].slice(-maxLines);
  fs.writeFileSync(logFilePath(instanceId), JSON.stringify(merged));
}
