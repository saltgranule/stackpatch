import { describe, expect, it } from "vitest";
import { StackpatchDaemon } from "./daemon.js";

describe("StackpatchDaemon", () => {
  it("starts with zero managed instances", () => {
    const daemon = new StackpatchDaemon();
    expect(daemon.getState()).toEqual({
      running: false,
      managedInstances: 0,
    });
  });
});
