import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { PathSecurityError } from "@stackpatch/shared";
import {
  createInstanceEntry,
  getDirectorySize,
  listDirectory,
  renameInstanceEntry,
  resolveInstanceFilePath,
  sanitizeFileName,
} from "./instance-files.js";

describe("instance-files", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "stackpatch-files-"));
    fs.writeFileSync(path.join(tempDir, "readme.txt"), "hello");
    fs.mkdirSync(path.join(tempDir, "plugins"));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("sums directory size", () => {
    fs.writeFileSync(path.join(tempDir, "plugins", "a.txt"), "12345");
    expect(getDirectorySize(tempDir)).toBe(10);
  });

  it("lists directory entries", () => {
    const entries = listDirectory(tempDir);
    expect(entries.map((entry) => entry.name)).toEqual(["plugins", "readme.txt"]);
    expect(entries[0]?.type).toBe("directory");
    expect(entries[1]?.type).toBe("file");
  });

  it("blocks path traversal", () => {
    expect(() => resolveInstanceFilePath(tempDir, "../secrets")).toThrow(PathSecurityError);
  });

  it("rejects unsafe upload names", () => {
    expect(() => sanitizeFileName("..")).toThrow(PathSecurityError);
    expect(() => sanitizeFileName("")).toThrow(PathSecurityError);
  });

  it("creates directories and blank files", () => {
    const directory = createInstanceEntry(tempDir, "", "docs", "directory");
    expect(directory.path).toBe("docs");
    expect(fs.statSync(path.join(tempDir, "docs")).isDirectory()).toBe(true);

    const file = createInstanceEntry(tempDir, "docs", "notes.txt", "file");
    expect(file.path).toBe("docs/notes.txt");
    expect(fs.readFileSync(path.join(tempDir, "docs", "notes.txt"), "utf8")).toBe("");
  });

  it("renames entries within the same directory", () => {
    const renamed = renameInstanceEntry(tempDir, "readme.txt", "guide.txt");
    expect(renamed.path).toBe("guide.txt");
    expect(fs.existsSync(path.join(tempDir, "guide.txt"))).toBe(true);
    expect(fs.existsSync(path.join(tempDir, "readme.txt"))).toBe(false);
  });
});
