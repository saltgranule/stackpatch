import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { PathSecurityError } from "@stackpatch/shared";

describe("instance-paths", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "stackpatch-paths-"));
    process.env.STACKPATCH_DATA_DIR = tempDir;
  });

  afterEach(() => {
    delete process.env.STACKPATCH_DATA_DIR;
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("creates default directory under .data/instances", async () => {
    const { prepareWorkingDirectory } = await import("./instance-paths.js");
    const resolved = prepareWorkingDirectory("abc-123", "Minecraft Server");

    expect(resolved).toBe(
      path.join(tempDir, "instances", "minecraft-server"),
    );
    expect(fs.existsSync(resolved)).toBe(true);
  });

  it("rejects traversal in custom paths", async () => {
    const { prepareWorkingDirectory } = await import("./instance-paths.js");

    expect(() =>
      prepareWorkingDirectory("abc-123", "Test", "../outside"),
    ).toThrow(PathSecurityError);
  });

  it("requires existing directory for absolute paths outside instances root", async () => {
    const { prepareWorkingDirectory } = await import("./instance-paths.js");
    const outside = path.join(tempDir, "outside");
    fs.mkdirSync(outside);

    const resolved = prepareWorkingDirectory("abc-123", "Test", outside);
    expect(resolved).toBe(path.resolve(outside));
  });

  it("allows PATH-style executable names", async () => {
    const { validateExecutablePath } = await import("./instance-paths.js");
    expect(validateExecutablePath("java")).toBe("java");
  });

  it("validates absolute executable paths", async () => {
    const { validateExecutablePath } = await import("./instance-paths.js");
    const executable = path.join(tempDir, "run.cmd");
    fs.writeFileSync(executable, "@echo off\n");

    expect(validateExecutablePath(executable)).toBe(path.resolve(executable));
  });
});
