import type { LogLine } from "@stackpatch/shared";
import { createConsoleSystemLine } from "@stackpatch/shared";
import { logToInstanceConsole } from "../services/instance-console-log.js";

interface ConsoleSocket {
  readyState: number;
  send: (data: string) => void;
}

const OPEN = 1;

export function sendConsoleLine(socket: ConsoleSocket, line: LogLine): void {
  if (socket.readyState !== OPEN) {
    return;
  }
  socket.send(JSON.stringify({ type: "log", line }));
}

export async function reportConsoleError(
  instanceId: string,
  socket: ConsoleSocket,
  message: string,
): Promise<void> {
  const line = (await logToInstanceConsole(instanceId, message)) ?? createConsoleSystemLine(message);
  sendConsoleLine(socket, line);
}
