import type { Instance, InstanceRuntimeStatus } from "@stackpatch/shared";
import { getInstanceById, listInstances, updateInstanceRuntime } from "../db/instances.js";
import { getDaemonClient, isDaemonError } from "./daemon-client.js";
import { isDaemonConnected } from "./daemon.js";

function runtimeMatchesInstance(
  instance: Instance,
  runtime: InstanceRuntimeStatus,
): boolean {
  return (
    instance.status === runtime.status &&
    instance.pid === runtime.pid &&
    (runtime.startedAt == null || instance.lastStartedAt === runtime.startedAt)
  );
}

function applyRuntime(instance: Instance, runtime: InstanceRuntimeStatus | undefined): Instance {
  if (!runtime) {
    if (
      instance.status === "running" ||
      instance.status === "starting" ||
      instance.status === "stopping"
    ) {
      const updated = updateInstanceRuntime(instance.id, "stopped", null);
      return updated ?? { ...instance, status: "stopped", pid: null };
    }
    return instance;
  }

  if (runtimeMatchesInstance(instance, runtime)) {
    return instance;
  }

  const updated = updateInstanceRuntime(
    instance.id,
    runtime.status,
    runtime.pid,
    runtime.startedAt,
  );
  return updated ?? {
    ...instance,
    status: runtime.status,
    pid: runtime.pid,
    lastStartedAt: runtime.startedAt ?? instance.lastStartedAt,
  };
}

export function applyRuntimeUpdate(runtime: InstanceRuntimeStatus): Instance | null {
  const instance = getInstanceById(runtime.instanceId);
  if (!instance) {
    return null;
  }
  return applyRuntime(instance, runtime);
}

export async function syncInstance(instanceId: string): Promise<Instance | null> {
  const instance = getInstanceById(instanceId);
  if (!instance) {
    return null;
  }

  if (!isDaemonConnected()) {
    return instance;
  }

  try {
    const runtimes = await getDaemonClient().getStatus(instanceId);
    return applyRuntime(instance, runtimes[0]);
  } catch (error) {
    if (isDaemonError(error)) {
      return instance;
    }
    throw error;
  }
}

export async function syncAllInstances(): Promise<Instance[]> {
  const instances = listInstances();

  if (!isDaemonConnected()) {
    return instances;
  }

  try {
    const runtimes = await getDaemonClient().getStatus();
    const runtimeMap = new Map(runtimes.map((runtime) => [runtime.instanceId, runtime]));

    return instances.map((instance) => applyRuntime(instance, runtimeMap.get(instance.id)));
  } catch (error) {
    if (isDaemonError(error)) {
      return instances;
    }
    throw error;
  }
}
