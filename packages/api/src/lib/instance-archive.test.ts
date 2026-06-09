import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { PathSecurityError } from "@stackpatch/shared";
import { archiveInstancePaths, unzipInstanceFile } from "./instance-archive.js";

describe("instance-archive", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "stackpatch-archive-"));
    fs.writeFileSync(path.join(tempDir, "readme.txt"), "hello");
    fs.mkdirSync(path.join(tempDir, "plugins"));
    fs.writeFileSync(path.join(tempDir, "plugins", "mod.txt"), "mod");
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("archives selected files into the current directory", () => {
    const result = archiveInstancePaths(tempDir, ["readme.txt", "plugins"], "");
    expect(result.archived).toEqual(["readme.txt", "plugins"]);
    expect(fs.existsSync(path.join(tempDir, path.basename(result.archivePath)))).toBe(true);
    expect(result.archivePath.endsWith(".zip")).toBe(true);
  });

  it("extracts zip files into their directory", () => {
    const archive = archiveInstancePaths(tempDir, ["plugins/mod.txt"], "plugins", "bundle.zip");
    expect(archive.archivePath).toBe("plugins/bundle.zip");

    fs.rmSync(path.join(tempDir, "plugins", "mod.txt"));
    const result = unzipInstanceFile(tempDir, "plugins/bundle.zip");
    expect(result.extractedTo).toBe("plugins");
    expect(fs.existsSync(path.join(tempDir, "plugins", "mod.txt"))).toBe(true);
  });

  it("rejects non-zip extraction targets", () => {
    expect(() => unzipInstanceFile(tempDir, "readme.txt")).toThrow(PathSecurityError);
  });
});
