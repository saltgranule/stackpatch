import type { LogLine } from "@stackpatch/shared";
import { formatConsoleSystemMessage } from "@stackpatch/shared";
import { getDaemonClient } from "./daemon-client.js";
import { isDaemonConnected } from "./daemon.js";

export async function logToInstanceConsole(
  instanceId: string,
  message: string,
  stream: LogLine["stream"] = "stderr",
): Promise<LogLine | null> {
  if (!isDaemonConnected()) {
    return null;
  }

  try {
    return await getDaemonClient().appendLog(
      instanceId,
      formatConsoleSystemMessage(message),
      stream,
    );
  } catch {
    return null;
  }
}
