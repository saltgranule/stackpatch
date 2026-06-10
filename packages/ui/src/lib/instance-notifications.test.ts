import { describe, expect, it, vi } from "vitest";
import type { Instance } from "@stackpatch/shared";
import {
  createInstanceNotificationState,
  notifyInstanceCrashIfNeeded,
  notifyInstanceRestartResult,
  notifyInstanceStartResult,
  processInstanceStatusUpdates,
  recordInstanceStatus,
  shouldNotifyInstanceCrash,
} from "./instance-notifications.js";

function makeInstance(overrides: Partial<Instance> = {}): Instance {
  return {
    id: "id-1",
    name: "Survival",
    applicationType: "minecraft",
    executablePath: "java",
    arguments: "",
    startupCommand: "java -jar server.jar",
    workingDirectory: "C:\\servers\\survival",
    memoryLimitMb: null,
    cpuLimitPercent: null,
    autoRestart: true,
    maxRestartRetries: 3,
    stopCommand: "stop",
    status: "stopped",
    pid: null,
    lastStartedAt: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("instance-notifications", () => {
  it("detects unexpected crash transitions", () => {
    expect(shouldNotifyInstanceCrash("running", "crashed")).toBe(true);
    expect(shouldNotifyInstanceCrash("starting", "crashed")).toBe(true);
    expect(shouldNotifyInstanceCrash("stopping", "crashed")).toBe(true);
    expect(shouldNotifyInstanceCrash(undefined, "crashed")).toBe(false);
    expect(shouldNotifyInstanceCrash("stopped", "crashed")).toBe(false);
    expect(shouldNotifyInstanceCrash("running", "stopped")).toBe(false);
  });

  it("clears crash dedupe when an instance leaves crashed state", () => {
    const state = createInstanceNotificationState();
    state.notifiedCrashes.add("id-1");

    recordInstanceStatus(state, "id-1", "stopped");

    expect(state.notifiedCrashes.has("id-1")).toBe(false);
    expect(state.previousStatuses.get("id-1")).toBe("stopped");
  });

  it("dedupes repeated crash notifications for the same episode", () => {
    const state = createInstanceNotificationState();
    const notifyError = vi.fn();
    const crashed = makeInstance({ status: "crashed" });

    expect(
      notifyInstanceCrashIfNeeded(state, crashed, "First message.", notifyError),
    ).toBe(true);
    expect(
      notifyInstanceCrashIfNeeded(state, crashed, "Second message.", notifyError),
    ).toBe(false);

    expect(notifyError).toHaveBeenCalledTimes(1);
    expect(notifyError).toHaveBeenCalledWith(
      "Survival crashed",
      "First message.",
    );
  });

  it("notifies for websocket-driven crashes", () => {
    const state = createInstanceNotificationState();
    const notifyError = vi.fn();
    const running = makeInstance({ status: "running" });

    recordInstanceStatus(state, running.id, "running");
    processInstanceStatusUpdates(
      [makeInstance({ status: "crashed" })],
      state,
      notifyError,
    );

    expect(notifyError).toHaveBeenCalledTimes(1);
    expect(notifyError).toHaveBeenCalledWith(
      "Survival crashed",
      "The process exited unexpectedly.",
    );
  });

  it("does not double-notify when start result and status updates both see a crash", () => {
    const state = createInstanceNotificationState();
    const notifySuccess = vi.fn();
    const notifyError = vi.fn();
    const crashed = makeInstance({ status: "crashed" });

    recordInstanceStatus(state, crashed.id, "starting");
    notifyInstanceStartResult(crashed, notifySuccess, notifyError, state);
    processInstanceStatusUpdates([crashed], state, notifyError);

    expect(notifySuccess).not.toHaveBeenCalled();
    expect(notifyError).toHaveBeenCalledTimes(1);
    expect(notifyError).toHaveBeenCalledWith(
      "Survival crashed",
      "The process exited immediately after start.",
    );
  });

  it("does not double-notify when restart result and status updates both see a crash", () => {
    const state = createInstanceNotificationState();
    const notifySuccess = vi.fn();
    const notifyError = vi.fn();
    const crashed = makeInstance({ status: "crashed" });

    recordInstanceStatus(state, crashed.id, "starting");
    notifyInstanceRestartResult(crashed, notifySuccess, notifyError, state);
    processInstanceStatusUpdates([crashed], state, notifyError);

    expect(notifySuccess).not.toHaveBeenCalled();
    expect(notifyError).toHaveBeenCalledTimes(1);
    expect(notifyError).toHaveBeenCalledWith(
      "Survival crashed",
      "The process exited immediately after restart.",
    );
  });

  it("does not double-notify when status updates arrive before the action result", () => {
    const state = createInstanceNotificationState();
    const notifySuccess = vi.fn();
    const notifyError = vi.fn();
    const crashed = makeInstance({ status: "crashed" });

    recordInstanceStatus(state, crashed.id, "starting");
    processInstanceStatusUpdates([crashed], state, notifyError);
    notifyInstanceStartResult(crashed, notifySuccess, notifyError, state);

    expect(notifySuccess).not.toHaveBeenCalled();
    expect(notifyError).toHaveBeenCalledTimes(1);
    expect(notifyError).toHaveBeenCalledWith(
      "Survival crashed",
      "The process exited unexpectedly.",
    );
  });

  it("removes stale tracking when instances disappear", () => {
    const state = createInstanceNotificationState();
    const notifyError = vi.fn();

    recordInstanceStatus(state, "gone", "running");
    state.notifiedCrashes.add("gone");

    processInstanceStatusUpdates([], state, notifyError);

    expect(state.previousStatuses.has("gone")).toBe(false);
    expect(state.notifiedCrashes.has("gone")).toBe(false);
    expect(notifyError).not.toHaveBeenCalled();
  });
});
