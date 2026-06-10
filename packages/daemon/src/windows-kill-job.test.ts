import { describe, expect, it } from "vitest";
import { isMemoryLimitExitCode, STATUS_JOB_MEMORY_LIMIT } from "./windows-kill-job.js";

describe("isMemoryLimitExitCode", () => {
  it("detects STATUS_JOB_MEMORY_LIMIT as unsigned", () => {
    expect(isMemoryLimitExitCode(STATUS_JOB_MEMORY_LIMIT)).toBe(true);
  });

  it("detects STATUS_JOB_MEMORY_LIMIT as signed", () => {
    expect(isMemoryLimitExitCode(-1073741401)).toBe(true);
  });

  it("returns false for other exit codes", () => {
    expect(isMemoryLimitExitCode(0)).toBe(false);
    expect(isMemoryLimitExitCode(1)).toBe(false);
    expect(isMemoryLimitExitCode(null)).toBe(false);
  });
});
