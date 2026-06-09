import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

describe("instances repository", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "stackpatch-test-"));
    process.env.STACKPATCH_DATA_DIR = tempDir;
  });

  afterEach(() => {
    delete process.env.STACKPATCH_DATA_DIR;
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("creates and lists instances", async () => {
    const { closeDatabase } = await import("./database.js");
    const { createInstance, listInstances } = await import("./instances.js");

    createInstance("test-id", {
      name: "Minecraft",
      applicationType: "minecraft",
      executablePath: "C:\\java\\bin\\java.exe",
      arguments: "-jar server.jar",
      workingDirectory: path.join(tempDir, "instances", "minecraft"),
    });

    const instances = listInstances();
    expect(instances).toHaveLength(1);
    expect(instances[0]?.name).toBe("Minecraft");
    expect(instances[0]?.applicationType).toBe("minecraft");
    expect(instances[0]?.startupCommand).toBe("C:\\java\\bin\\java.exe -jar server.jar");
    expect(instances[0]?.stopCommand).toBe("stop");
    expect(instances[0]?.status).toBe("stopped");
    expect(instances[0]?.pid).toBeNull();
    expect(instances[0]?.lastStartedAt).toBeNull();

    closeDatabase();
  });
});
