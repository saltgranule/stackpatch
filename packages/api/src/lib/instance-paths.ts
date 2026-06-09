import fs from "node:fs";
import path from "node:path";
import {
  PathSecurityError,
  assertPathInputSafe,
  isPathInsideRoot,
  resolveInstancesRoot,
  resolveWorkingDirectory,
  slugifyInstanceName,
} from "@stackpatch/shared";
import { config } from "../config.js";

export interface PathDefaults {
  dataDir: string;
  instancesRoot: string;
}

export function getPathDefaults(): PathDefaults {
  return {
    dataDir: config.dataDir,
    instancesRoot: resolveInstancesRoot(config.dataDir),
  };
}

export function suggestWorkingDirectory(name: string): string {
  const { instancesRoot } = getPathDefaults();
  if (!name.trim()) {
    return instancesRoot;
  }
  return path.join(instancesRoot, slugifyInstanceName(name));
}

function uniqueDefaultDirectory(
  instancesRoot: string,
  instanceId: string,
  name: string,
): string {
  const slug = slugifyInstanceName(name);
  let candidate = path.join(instancesRoot, slug);

  if (!fs.existsSync(candidate)) {
    return candidate;
  }

  candidate = path.join(instancesRoot, `${slug}-${instanceId.slice(0, 8)}`);
  return candidate;
}

export function prepareWorkingDirectory(
  instanceId: string,
  name: string,
  rawWorkingDirectory?: string,
): string {
  const { instancesRoot } = getPathDefaults();
  fs.mkdirSync(instancesRoot, { recursive: true });

  const input = rawWorkingDirectory?.trim();
  const target = input
    ? resolveWorkingDirectory(input, instancesRoot)
    : uniqueDefaultDirectory(instancesRoot, instanceId, name);

  if (isPathInsideRoot(target, instancesRoot)) {
    fs.mkdirSync(target, { recursive: true });
    return target;
  }

  if (!fs.existsSync(target)) {
    throw new PathSecurityError(
      "Custom working directories outside .data/instances must already exist",
    );
  }

  const stat = fs.statSync(target);
  if (!stat.isDirectory()) {
    throw new PathSecurityError("Working directory must be a folder");
  }

  return target;
}

export function validateExecutablePath(raw: string, workingDirectory?: string): string {
  assertPathInputSafe(raw, "Executable");
  const trimmed = raw.trim();

  // Bare names are resolved via PATH when the process starts (e.g. java, node).
  if (!path.isAbsolute(trimmed) && !/[\\/]/.test(trimmed)) {
    return trimmed;
  }

  const resolved = path.isAbsolute(trimmed)
    ? path.resolve(trimmed)
    : workingDirectory
      ? path.resolve(workingDirectory, trimmed)
      : null;

  if (!resolved) {
    throw new PathSecurityError("Relative executable paths require a working directory");
  }

  if (workingDirectory && !path.isAbsolute(trimmed) && !isPathInsideRoot(resolved, workingDirectory)) {
    throw new PathSecurityError("Executable must stay inside the working directory");
  }

  if (!fs.existsSync(resolved)) {
    throw new PathSecurityError("Executable path does not exist");
  }

  const stat = fs.statSync(resolved);
  if (!stat.isFile()) {
    throw new PathSecurityError("Executable path must point to a file");
  }

  return resolved;
}

export function isPathSecurityError(error: unknown): error is PathSecurityError {
  return error instanceof PathSecurityError;
}
