import { execSync } from "node:child_process";
import fs from "node:fs";
import type { InstanceProcessConfig } from "@stackpatch/shared";
import { daemonConfig } from "./config.js";

export interface RegistryEntry {
  pid: number;
  startedAt: string;
  config?: InstanceProcessConfig;
}

interface RegistryFile {
  instances: Record<string, RegistryEntry>;
}

export class PidRegistry {
  private readonly registryPath = daemonConfig.pidRegistryPath;

  read(): RegistryFile {
    try {
      const raw = fs.readFileSync(this.registryPath, "utf-8");
      return JSON.parse(raw) as RegistryFile;
    } catch {
      return { instances: {} };
    }
  }

  write(registry: RegistryFile): void {
    fs.mkdirSync(daemonConfig.dataDir, { recursive: true });
    fs.writeFileSync(this.registryPath, JSON.stringify(registry, null, 2));
  }

  set(
    instanceId: string,
    pid: number,
    startedAt: string,
    config?: InstanceProcessConfig,
  ): void {
    const registry = this.read();
    registry.instances[instanceId] = { pid, startedAt, config };
    this.write(registry);
  }

  remove(instanceId: string): void {
    const registry = this.read();
    delete registry.instances[instanceId];
    this.write(registry);
  }

  clear(): void {
    this.write({ instances: {} });
  }

  listPids(): number[] {
    return Object.values(this.read().instances).map((entry) => entry.pid);
  }

  get(instanceId: string): RegistryEntry | null {
    return this.read().instances[instanceId] ?? null;
  }
}

export function isProcessAlive(pid: number): boolean {
  if (!pid || pid <= 0) {
    return false;
  }

  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export function killProcess(
  pid: number,
  force = false,
  killProcessGroup = false,
): void {
  if (!pid || pid <= 0) {
    return;
  }

  try {
    if (process.platform === "win32") {
      const flags = force ? "/F /T" : "/T";
      execSync(`taskkill ${flags} /PID ${pid}`.trim(), {
        stdio: "ignore",
        windowsHide: true,
      });
      return;
    }

    const signal = force ? "SIGKILL" : "SIGTERM";
    if (killProcessGroup) {
      try {
        process.kill(-pid, signal);
        return;
      } catch {
        // Fall back to the direct child when it is not a process group leader.
      }
    }

    process.kill(pid, signal);
  } catch {
    // Process may already be gone.
  }
}

export function forceKillAllRegistered(): number {
  const registry = new PidRegistry();
  const data = registry.read();
  let killed = 0;

  for (const entry of Object.values(data.instances)) {
    if (isProcessAlive(entry.pid)) {
      killProcess(entry.pid, true, true);
      if (!isProcessAlive(entry.pid)) {
        killed += 1;
      }
    }
  }

  registry.clear();
  return killed;
}
