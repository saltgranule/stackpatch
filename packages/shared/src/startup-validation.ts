import fs from "node:fs";
import { PathSecurityError } from "./path-security.js";
import {
  collectStartupCommandTargets,
  resolveStartupTargetPath,
} from "./startup-targets.js";

export function validateStartupCommandFiles(
  executablePath: string,
  argumentsRaw: string,
  workingDirectory: string,
): void {
  if (!fs.existsSync(workingDirectory)) {
    throw new PathSecurityError("Working directory does not exist");
  }

  const targets = collectStartupCommandTargets(executablePath, argumentsRaw);
  const missing: string[] = [];

  for (const target of targets) {
    const resolved = resolveStartupTargetPath(target, workingDirectory);
    if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) {
      missing.push(target);
    }
  }

  if (missing.length === 1) {
    throw new PathSecurityError(
      `File from startup command not found in instance: ${missing[0]}`,
    );
  }

  if (missing.length > 1) {
    throw new PathSecurityError(
      `Files from startup command not found in instance: ${missing.join(", ")}`,
    );
  }
}
