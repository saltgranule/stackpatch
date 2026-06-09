import { PathSecurityError } from "./path-security.js";
import { parseArguments } from "./parse-arguments.js";

const FIRST_TOKEN_PATTERN = /^(?:[^\s"']+|"[^"]*"|'[^']*')+/;

export function parseStartupCommand(command: string): {
  executablePath: string;
  arguments: string;
} {
  const trimmed = command.trim();
  if (!trimmed) {
    throw new PathSecurityError("Startup command is required");
  }

  const match = trimmed.match(FIRST_TOKEN_PATTERN);
  if (!match) {
    throw new PathSecurityError("Startup command is required");
  }

  const executablePath = parseArguments(match[0])[0];
  if (!executablePath) {
    throw new PathSecurityError("Startup command is required");
  }

  return {
    executablePath,
    arguments: trimmed.slice(match[0].length).trim(),
  };
}

export function formatStartupCommand(
  executablePath: string,
  args: string,
): string {
  const trimmedArgs = args.trim();
  return trimmedArgs ? `${executablePath} ${trimmedArgs}` : executablePath;
}
