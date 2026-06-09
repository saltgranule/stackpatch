import { parseStartupCommand } from "@stackpatch/shared";
import { validateExecutablePath } from "./instance-paths.js";

export function resolveStartupCommand(
  startupCommand: string,
  workingDirectory?: string,
): {
  executablePath: string;
  arguments: string;
} {
  const parsed = parseStartupCommand(startupCommand);
  const executablePath = validateExecutablePath(parsed.executablePath, workingDirectory);
  return {
    executablePath,
    arguments: parsed.arguments,
  };
}
