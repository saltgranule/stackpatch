import { describe, expect, it } from "vitest";
import { isProcessAlive, killProcess } from "./pid-registry.js";

describe("pid-registry", () => {
  it("treats invalid pids as not alive", () => {
    expect(isProcessAlive(0)).toBe(false);
    expect(isProcessAlive(-1)).toBe(false);
  });

  it("does not throw when killing an invalid pid", () => {
    expect(() => killProcess(0, true)).not.toThrow();
  });

  it("reports the current process as alive", () => {
    expect(isProcessAlive(process.pid)).toBe(true);
  });
});
