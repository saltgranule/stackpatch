import { describe, expect, it } from "vitest";
import {
  describeScheduleInterval,
  isIntervalDue,
  isValidScheduleInterval,
  parseLegacyCronIntervalHours,
  scheduleIntervalToMs,
} from "./schedules.js";

describe("schedules", () => {
  it("validates interval value and unit", () => {
    expect(isValidScheduleInterval(1, "hours")).toBe(true);
    expect(isValidScheduleInterval(48, "hours")).toBe(true);
    expect(isValidScheduleInterval(60, "minutes")).toBe(true);
    expect(isValidScheduleInterval(61, "minutes")).toBe(false);
    expect(isValidScheduleInterval(30, "days")).toBe(true);
    expect(isValidScheduleInterval(31, "days")).toBe(false);
  });

  it("describes intervals in plain language", () => {
    expect(describeScheduleInterval(1, "hours")).toBe("Every hour");
    expect(describeScheduleInterval(6, "hours")).toBe("Every 6 hours");
    expect(describeScheduleInterval(1, "minutes")).toBe("Every minute");
    expect(describeScheduleInterval(2, "days")).toBe("Every 2 days");
  });

  it("converts intervals to milliseconds", () => {
    expect(scheduleIntervalToMs(5, "minutes")).toBe(5 * 60 * 1000);
    expect(scheduleIntervalToMs(2, "hours")).toBe(2 * 60 * 60 * 1000);
    expect(scheduleIntervalToMs(1, "days")).toBe(24 * 60 * 60 * 1000);
  });

  it("parses legacy cron intervals", () => {
    expect(parseLegacyCronIntervalHours("0 * * * *")).toBe(1);
    expect(parseLegacyCronIntervalHours("0 */6 * * *")).toBe(6);
    expect(parseLegacyCronIntervalHours("0 3 * * *")).toBe(24);
  });

  it("detects when an interval is due", () => {
    const anchor = new Date("2026-06-09T00:00:00.000Z");
    const dueAt = new Date("2026-06-09T03:00:01.000Z");
    expect(isIntervalDue(3, "hours", dueAt, null, anchor)).toBe(true);
    expect(isIntervalDue(3, "hours", dueAt, dueAt, anchor)).toBe(false);
  });
});
