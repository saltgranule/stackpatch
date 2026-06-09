import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_DAEMON_IPC_PORT, DEFAULT_PANEL_PORT } from "@stackpatch/shared";

describe("system settings", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "stackpatch-settings-"));
    process.env.STACKPATCH_DATA_DIR = tempDir;
  });

  afterEach(() => {
    delete process.env.STACKPATCH_DATA_DIR;
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("returns default ports", async () => {
    const { closeDatabase } = await import("./database.js");
    const { getSystemSettings } = await import("./settings.js");

    expect(getSystemSettings()).toEqual({
      panelPort: DEFAULT_PANEL_PORT,
      daemonPort: DEFAULT_DAEMON_IPC_PORT,
    });

    closeDatabase();
  });

  it("updates saved ports", async () => {
    const { closeDatabase } = await import("./database.js");
    const { getSystemSettings, updateSystemSettings } = await import("./settings.js");

    updateSystemSettings({ panelPort: 24000, daemonPort: 25000 });

    expect(getSystemSettings()).toEqual({
      panelPort: 24000,
      daemonPort: 25000,
    });

    closeDatabase();
  });
});
