import { describe, expect, it } from "vitest";
import {
  APP_NAME,
  DEFAULT_DAEMON_IPC_PORT,
  DEFAULT_PANEL_PORT,
  isValidPort,
  LOG_BUFFER_SIZE,
  STATUS_RECONCILE_INTERVAL_MS,
} from "./constants.js";

describe("constants", () => {
  it("defines core app identity", () => {
    expect(APP_NAME).toBe("stackpatch");
    expect(DEFAULT_PANEL_PORT).toBe(23333);
    expect(DEFAULT_DAEMON_IPC_PORT).toBe(24444);
    expect(LOG_BUFFER_SIZE).toBe(500);
    expect(STATUS_RECONCILE_INTERVAL_MS).toBe(60_000);
  });

  it("validates network ports", () => {
    expect(isValidPort(23333)).toBe(true);
    expect(isValidPort(0)).toBe(false);
    expect(isValidPort(65536)).toBe(false);
  });
});
