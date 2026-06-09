import { describe, expect, it } from "vitest";
import {
  CONSOLE_SYSTEM_PREFIX,
  createConsoleSystemLine,
  formatConsoleSystemMessage,
  isConsoleOutputLine,
} from "./console-log.js";

describe("console-log", () => {
  it("prefixes system messages", () => {
    expect(formatConsoleSystemMessage("Daemon request timed out")).toBe(
      `${CONSOLE_SYSTEM_PREFIX} Daemon request timed out`,
    );
  });

  it("does not double-prefix messages", () => {
    const message = `${CONSOLE_SYSTEM_PREFIX} Daemon disconnected`;
    expect(formatConsoleSystemMessage(message)).toBe(message);
  });

  it("creates stderr system lines", () => {
    expect(createConsoleSystemLine("Failed to send input")).toEqual({
      stream: "stderr",
      text: `${CONSOLE_SYSTEM_PREFIX} Failed to send input`,
      timestamp: expect.any(String),
    });
  });

  it("keeps non-empty console output lines", () => {
    expect(isConsoleOutputLine(">")).toBe(true);
    expect(isConsoleOutputLine("2026-06-08 | INFO | discord.gateway | connected")).toBe(true);
    expect(isConsoleOutputLine("   ")).toBe(false);
  });
});
