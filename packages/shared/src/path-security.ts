import path from "node:path";

export class PathSecurityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PathSecurityError";
  }
}

const NULL_BYTE = /\0/;

export function assertPathInputSafe(raw: string, label = "Path"): void {
  if (!raw.trim()) {
    throw new PathSecurityError(`${label} is required`);
  }

  if (NULL_BYTE.test(raw)) {
    throw new PathSecurityError(`${label} contains invalid characters`);
  }

  const segments = raw.split(/[/\\]/);
  if (segments.some((segment) => segment === "..")) {
    throw new PathSecurityError(`${label} must not contain parent directory references (..)`);
  }
}

export function slugifyInstanceName(name: string): string {
  const slug = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return slug || "instance";
}

export function resolveWorkingDirectory(
  raw: string,
  instancesRoot: string,
): string {
  assertPathInputSafe(raw, "Working directory");

  const resolved = path.isAbsolute(raw)
    ? path.resolve(raw)
    : path.resolve(instancesRoot, raw);

  if (!path.isAbsolute(raw)) {
    const relative = path.relative(instancesRoot, resolved);
    if (relative.startsWith("..") || path.isAbsolute(relative)) {
      throw new PathSecurityError(
        "Relative working directories must stay inside the instances folder",
      );
    }
  }

  return resolved;
}

export function resolveExecutablePath(raw: string): string {
  assertPathInputSafe(raw, "Executable path");

  if (!path.isAbsolute(raw)) {
    throw new PathSecurityError("Executable path must be absolute");
  }

  return path.resolve(raw);
}

export function isPathInsideRoot(target: string, root: string): boolean {
  const relative = path.relative(path.resolve(root), path.resolve(target));
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}
