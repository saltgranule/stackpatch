import fs from "node:fs";
import path from "node:path";
import { slugifyInstanceName } from "./path-security.js";

export function findWorkspaceRoot(startDir = process.cwd()): string {
  let dir = startDir;

  while (dir !== path.dirname(dir)) {
    if (fs.existsSync(path.join(dir, "pnpm-workspace.yaml"))) {
      return dir;
    }
    dir = path.dirname(dir);
  }

  return startDir;
}

export const INSTANCES_SUBDIR = "instances";

export function resolveDataDir(): string {
  if (process.env.STACKPATCH_DATA_DIR) {
    return process.env.STACKPATCH_DATA_DIR;
  }
  return path.join(findWorkspaceRoot(), ".data");
}

export function resolveInstancesRoot(dataDir = resolveDataDir()): string {
  return path.join(dataDir, INSTANCES_SUBDIR);
}

export function buildDefaultWorkingDirectory(
  instancesRoot: string,
  instanceId: string,
  name?: string,
): string {
  const slug = name ? slugifyInstanceName(name) : instanceId;
  return path.join(instancesRoot, slug);
}
