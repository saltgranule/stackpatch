import type { LogLine } from "@stackpatch/shared";
import { createConsoleSystemLine, LOG_BUFFER_SIZE } from "@stackpatch/shared";

export function appendConsoleLine(current: LogLine[], line: LogLine): LogLine[] {
  const next = [...current, line];
  if (next.length <= LOG_BUFFER_SIZE) {
    return next;
  }
  return next.slice(-LOG_BUFFER_SIZE);
}

export function appendConsoleMessage(current: LogLine[], message: string): LogLine[] {
  return appendConsoleLine(current, createConsoleSystemLine(message));
}
