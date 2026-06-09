import { describe, expect, it } from "vitest";
import { formatDateTime, formatInstanceStatus } from "./format.js";

describe("formatInstanceStatus", () => {
  it("title-cases instance statuses", () => {
    expect(formatInstanceStatus("running")).toBe("Running");
    expect(formatInstanceStatus("stopped")).toBe("Stopped");
    expect(formatInstanceStatus("crashed")).toBe("Crashed");
    expect(formatInstanceStatus("starting")).toBe("Starting");
    expect(formatInstanceStatus("stopping")).toBe("Stopping");
  });
});

describe("formatDateTime", () => {
  it("formats ISO timestamps as MM/DD/YYYY HH:MM", () => {
    expect(formatDateTime("2026-06-08T14:05:00.000Z")).toMatch(/^\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}$/);
    expect(formatDateTime(null)).toBe("—");
    expect(formatDateTime("invalid")).toBe("—");
  });
});
