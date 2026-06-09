import path from "node:path";
import { parseArguments } from "./parse-arguments.js";
import {
  PathSecurityError,
  assertPathInputSafe,
  isPathInsideRoot,
} from "./path-security.js";

const INTERPRETER_NAMES = new Set([
  "python",
  "python3",
  "py",
  "node",
  "nodejs",
  "deno",
  "bun",
  "go",
  "ruby",
  "perl",
  "php",
]);

const FILE_EXTENSIONS = new Set([
  ".py",
  ".js",
  ".mjs",
  ".cjs",
  ".ts",
  ".tsx",
  ".go",
  ".jar",
  ".war",
  ".sh",
  ".bat",
  ".cmd",
  ".ps1",
  ".rb",
  ".pl",
  ".lua",
]);

function executableBaseName(executablePath: string): string {
  const base = path.basename(executablePath.trim());
  return base.replace(/\.(exe|cmd|bat|com)$/i, "").toLowerCase();
}

function looksLikeFileReference(token: string): boolean {
  if (!token || token.startsWith("-")) {
    return false;
  }

  if (/^[\w+.-]+:\/\//.test(token)) {
    return false;
  }

  const extension = path.extname(token).toLowerCase();
  if (FILE_EXTENSIONS.has(extension)) {
    return true;
  }

  return /[\\/]/.test(token);
}

export function collectStartupCommandTargets(
  executablePath: string,
  argumentsRaw: string,
): string[] {
  const args = parseArguments(argumentsRaw);
  const targets = new Set<string>();

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "-jar" && args[index + 1]) {
      targets.add(args[index + 1]);
      index += 1;
      continue;
    }

    if (looksLikeFileReference(arg)) {
      targets.add(arg);
    }
  }

  const interpreter = executableBaseName(executablePath);
  if (INTERPRETER_NAMES.has(interpreter)) {
    const firstPositional = args.find((arg) => !arg.startsWith("-"));
    if (firstPositional) {
      targets.add(firstPositional);
    }
  }

  return [...targets];
}

export function resolveStartupTargetPath(
  target: string,
  workingDirectory: string,
): string {
  assertPathInputSafe(target, "Startup command file");
  const trimmed = target.trim();
  const resolved = path.isAbsolute(trimmed)
    ? path.resolve(trimmed)
    : path.resolve(workingDirectory, trimmed);

  if (!isPathInsideRoot(resolved, workingDirectory)) {
    throw new PathSecurityError(
      "Files from the startup command must stay inside the instance working directory",
    );
  }

  return resolved;
}
