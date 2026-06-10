import type { Instance, InstanceStatus } from "@stackpatch/shared";

type NotifySuccess = (title: string, description?: string) => void;
type NotifyError = (title: string, description?: string) => void;

const CRASH_WATCH_STATUSES: ReadonlySet<InstanceStatus> = new Set([
  "running",
  "starting",
  "stopping",
]);

export interface InstanceNotificationState {
  previousStatuses: Map<string, InstanceStatus>;
  notifiedCrashes: Set<string>;
}

export function createInstanceNotificationState(): InstanceNotificationState {
  return {
    previousStatuses: new Map(),
    notifiedCrashes: new Set(),
  };
}

export function shouldNotifyInstanceCrash(
  previousStatus: InstanceStatus | undefined,
  nextStatus: InstanceStatus,
): boolean {
  return (
    previousStatus !== undefined &&
    CRASH_WATCH_STATUSES.has(previousStatus) &&
    nextStatus === "crashed"
  );
}

export function recordInstanceStatus(
  state: InstanceNotificationState,
  instanceId: string,
  status: InstanceStatus,
): void {
  state.previousStatuses.set(instanceId, status);
  if (status !== "crashed") {
    state.notifiedCrashes.delete(instanceId);
  }
}

export function notifyInstanceCrashIfNeeded(
  state: InstanceNotificationState,
  instance: Instance,
  description: string,
  notifyError: NotifyError,
): boolean {
  if (instance.status !== "crashed") {
    recordInstanceStatus(state, instance.id, instance.status);
    return false;
  }

  if (state.notifiedCrashes.has(instance.id)) {
    recordInstanceStatus(state, instance.id, instance.status);
    return false;
  }

  state.notifiedCrashes.add(instance.id);
  recordInstanceStatus(state, instance.id, instance.status);
  notifyError(`${instance.name} crashed`, description);
  return true;
}

export function processInstanceStatusUpdates(
  instances: Instance[],
  state: InstanceNotificationState,
  notifyError: NotifyError,
): void {
  for (const instance of instances) {
    const previousStatus = state.previousStatuses.get(instance.id);
    if (shouldNotifyInstanceCrash(previousStatus, instance.status)) {
      notifyInstanceCrashIfNeeded(
        state,
        instance,
        "The process exited unexpectedly.",
        notifyError,
      );
    } else {
      recordInstanceStatus(state, instance.id, instance.status);
    }
  }

  const currentIds = new Set(instances.map((instance) => instance.id));
  for (const id of state.previousStatuses.keys()) {
    if (!currentIds.has(id)) {
      state.previousStatuses.delete(id);
      state.notifiedCrashes.delete(id);
    }
  }
}

export function notifyInstanceStartResult(
  instance: Instance,
  notifySuccess: NotifySuccess,
  notifyError: NotifyError,
  state: InstanceNotificationState,
) {
  if (instance.status === "crashed") {
    notifyInstanceCrashIfNeeded(
      state,
      instance,
      "The process exited immediately after start.",
      notifyError,
    );
    return;
  }

  recordInstanceStatus(state, instance.id, instance.status);
  notifySuccess(`${instance.name} started`, "The instance is now running.");
}

export function notifyInstanceRestartResult(
  instance: Instance,
  notifySuccess: NotifySuccess,
  notifyError: NotifyError,
  state: InstanceNotificationState,
) {
  if (instance.status === "crashed") {
    notifyInstanceCrashIfNeeded(
      state,
      instance,
      "The process exited immediately after restart.",
      notifyError,
    );
    return;
  }

  recordInstanceStatus(state, instance.id, instance.status);
  notifySuccess(`${instance.name} restarted`, "The instance is starting back up.");
}

export function notifyInstanceStopped(instanceName: string, notifySuccess: NotifySuccess) {
  notifySuccess(`${instanceName} stopped`, "The instance has been shut down.");
}

export function notifyInstanceTerminated(instanceName: string, notifySuccess: NotifySuccess) {
  notifySuccess(`${instanceName} terminated`, "The process was forcefully ended.");
}

export function notifyInstanceCloned(
  cloned: Instance,
  sourceName: string,
  notifySuccess: NotifySuccess,
) {
  notifySuccess(`${cloned.name} created`, `Cloned from ${sourceName}.`);
}

export function notifyInstanceDeleted(instanceName: string, notifySuccess: NotifySuccess) {
  notifySuccess(`${instanceName} deleted`, "The instance has been removed.");
}

export function notifyInstanceActionFailed(error: unknown, notifyError: NotifyError) {
  const description = error instanceof Error ? error.message : "Action failed";
  notifyError("Instance action failed", description);
}
