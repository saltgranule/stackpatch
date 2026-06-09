import { describe, expect, it } from "vitest";
import type { Instance } from "@stackpatch/shared";
import { filterAndSearchInstances, filterInstances, searchInstances } from "./instance-list.js";

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

describe("instance-list", () => {
  it("searches by name and working directory", () => {
    const instances = [
      makeInstance({ id: "a", name: "Alpha" }),
      makeInstance({ id: "b", name: "Beta", workingDirectory: "C:\\servers\\creative" }),
    ];

    expect(searchInstances(instances, "creative")).toHaveLength(1);
    expect(searchInstances(instances, "alpha")).toHaveLength(1);
  });

  it("filters by running and stopped status", () => {
    const instances = [
      makeInstance({ id: "a", status: "running" }),
      makeInstance({ id: "b", status: "stopped" }),
      makeInstance({ id: "c", status: "crashed" }),
      makeInstance({ id: "d", status: "starting" }),
    ];

    expect(filterInstances(instances, "running")).toEqual([instances[0]]);
    expect(filterInstances(instances, "stopped")).toEqual([instances[1]]);
  });

  it("filters recently crashed instances", () => {
    const recent = new Date().toISOString();
    const old = "2020-01-01T00:00:00.000Z";
    const instances = [
      makeInstance({ id: "a", status: "crashed", updatedAt: recent }),
      makeInstance({ id: "b", status: "crashed", updatedAt: old }),
      makeInstance({ id: "c", status: "running", updatedAt: recent }),
    ];

    expect(filterInstances(instances, "recently_crashed")).toEqual([instances[0]]);
  });

  it("applies filter before search", () => {
    const recent = new Date().toISOString();
    const instances = [
      makeInstance({ id: "a", name: "Alpha", lastStartedAt: recent }),
      makeInstance({ id: "b", name: "Beta", lastStartedAt: recent }),
    ];

    expect(filterAndSearchInstances(instances, "recently_started", "beta")).toEqual([instances[1]]);
  });

  it("ignores invalid timestamps in recent filters", () => {
    const instances = [
      makeInstance({ id: "a", status: "crashed", updatedAt: "not-a-date" }),
      makeInstance({ id: "b", lastStartedAt: "also-invalid" }),
    ];

    expect(filterInstances(instances, "recently_crashed")).toEqual([]);
    expect(filterInstances(instances, "recently_started")).toEqual([]);
  });
});
