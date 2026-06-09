import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_DAEMON_IPC_PORT, DEFAULT_PANEL_PORT } from "@stackpatch/shared";

describe("runtime config", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "stackpatch-runtime-config-"));
    process.env.STACKPATCH_DATA_DIR = tempDir;
    delete process.env.STACKPATCH_PORT;
    delete process.env.STACKPATCH_DAEMON_PORT;
  });

  afterEach(() => {
    delete process.env.STACKPATCH_DATA_DIR;
    delete process.env.STACKPATCH_PORT;
    delete process.env.STACKPATCH_DAEMON_PORT;
    fs.rmSync(tempDir, { recursive: true, force: true });
    vi.resetModules();
  });

  it("uses saved settings when env overrides are absent", async () => {
    const { closeDatabase } = await import("./db/database.js");
    const { updateSystemSettings } = await import("./db/settings.js");
    const { initializeRuntimeConfig, getSystemSettingsStatus } = await import("./runtime-config.js");

    updateSystemSettings({ panelPort: 24000, daemonPort: 25000 });
    initializeRuntimeConfig();

    expect(getSystemSettingsStatus()).toMatchObject({
      settings: { panelPort: 24000, daemonPort: 25000 },
      activePanelPort: 24000,
      activeDaemonPort: 25000,
      restartRequired: false,
      envOverrides: { panelPort: false, daemonPort: false },
    });

    closeDatabase();
  });

  it("reports restart required when saved settings differ from active ports", async () => {
    const { closeDatabase } = await import("./db/database.js");
    const { initializeRuntimeConfig, getSystemSettingsStatus } = await import("./runtime-config.js");
    const { updateSystemSettings } = await import("./db/settings.js");

    initializeRuntimeConfig();
    updateSystemSettings({ panelPort: 24000, daemonPort: 25000 });

    expect(getSystemSettingsStatus()).toMatchObject({
      settings: { panelPort: 24000, daemonPort: 25000 },
      activePanelPort: DEFAULT_PANEL_PORT,
      activeDaemonPort: DEFAULT_DAEMON_IPC_PORT,
      restartRequired: true,
      envOverrides: { panelPort: false, daemonPort: false },
    });

    closeDatabase();
  });

  it("prefers env overrides and reports them in status", async () => {
    process.env.STACKPATCH_PORT = "26000";
    process.env.STACKPATCH_DAEMON_PORT = "27000";

    const { closeDatabase } = await import("./db/database.js");
    const { initializeRuntimeConfig, getSystemSettingsStatus } = await import("./runtime-config.js");
    const { updateSystemSettings } = await import("./db/settings.js");

    updateSystemSettings({ panelPort: 24000, daemonPort: 25000 });
    initializeRuntimeConfig();

    expect(getSystemSettingsStatus()).toMatchObject({
      settings: { panelPort: 24000, daemonPort: 25000 },
      activePanelPort: 26000,
      activeDaemonPort: 27000,
      restartRequired: false,
      envOverrides: { panelPort: true, daemonPort: true },
    });

    closeDatabase();
  });
});
