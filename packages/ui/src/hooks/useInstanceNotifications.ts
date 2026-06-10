import { useEffect, useRef } from "react";
import type { Instance } from "@stackpatch/shared";
import {
  createInstanceNotificationState,
  notifyInstanceActionFailed,
  notifyInstanceCloned,
  notifyInstanceDeleted,
  notifyInstanceRestartResult,
  notifyInstanceStartResult,
  notifyInstanceStopped,
  notifyInstanceTerminated,
  processInstanceStatusUpdates,
  type InstanceNotificationState,
} from "../lib/instance-notifications";

type NotifySuccess = (title: string, description?: string) => void;
type NotifyError = (title: string, description?: string) => void;

export interface InstanceNotificationHandlers {
  notifyStartResult: (instance: Instance) => void;
  notifyRestartResult: (instance: Instance) => void;
  notifyStopResult: (instanceName: string) => void;
  notifyTerminateResult: (instanceName: string) => void;
  notifyCloneResult: (cloned: Instance, sourceName: string) => void;
  notifyDeleteResult: (instanceName: string) => void;
  notifyActionFailed: (error: unknown) => void;
}

export function useInstanceNotifications(
  instances: Instance[],
  { notifySuccess, notifyError }: { notifySuccess: NotifySuccess; notifyError: NotifyError },
): InstanceNotificationHandlers {
  const stateRef = useRef<InstanceNotificationState>(createInstanceNotificationState());

  useEffect(() => {
    processInstanceStatusUpdates(instances, stateRef.current, notifyError);
  }, [instances, notifyError]);

  const state = stateRef.current;

  return {
    notifyStartResult: (instance: Instance) =>
      notifyInstanceStartResult(instance, notifySuccess, notifyError, state),
    notifyRestartResult: (instance: Instance) =>
      notifyInstanceRestartResult(instance, notifySuccess, notifyError, state),
    notifyStopResult: (instanceName: string) => notifyInstanceStopped(instanceName, notifySuccess),
    notifyTerminateResult: (instanceName: string) =>
      notifyInstanceTerminated(instanceName, notifySuccess),
    notifyCloneResult: (cloned: Instance, sourceName: string) =>
      notifyInstanceCloned(cloned, sourceName, notifySuccess),
    notifyDeleteResult: (instanceName: string) =>
      notifyInstanceDeleted(instanceName, notifySuccess),
    notifyActionFailed: (error: unknown) => notifyInstanceActionFailed(error, notifyError),
  };
}
