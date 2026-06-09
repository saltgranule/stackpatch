import type { LogLine } from "./daemon-protocol.js";

export const CONSOLE_SYSTEM_PREFIX = "[stackpatch]";

export function formatConsoleSystemMessage(message: string): string {
  const trimmed = message.trim();
  if (trimmed.startsWith(CONSOLE_SYSTEM_PREFIX)) {
    return trimmed;
  }
  return `${CONSOLE_SYSTEM_PREFIX} ${trimmed}`;
}

export function createConsoleSystemLine(
  message: string,
  stream: LogLine["stream"] = "stderr",
): LogLine {
  return {
    stream,
    text: formatConsoleSystemMessage(message),
    timestamp: new Date().toISOString(),
  };
}

/** Keep every non-empty line; do not drop prompt-like or library output. */
export function isConsoleOutputLine(text: string): boolean {
  return text.trim().length > 0;
}
