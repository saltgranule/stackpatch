import { EventEmitter } from "node:events";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { PassThrough } from "node:stream";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import AdmZip from "adm-zip";
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
    vi.restoreAllMocks();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("archives selected files into the current directory", async () => {
    const result = await archiveInstancePaths(tempDir, ["readme.txt", "plugins"], "");
    expect(result.archived).toEqual(["readme.txt", "plugins"]);
    expect(fs.existsSync(path.join(tempDir, path.basename(result.archivePath)))).toBe(true);
    expect(result.archivePath.endsWith(".zip")).toBe(true);
  });

  it("extracts zip files into their directory", async () => {
    const archive = await archiveInstancePaths(tempDir, ["plugins/mod.txt"], "plugins", "bundle.zip");
    expect(archive.archivePath).toBe("plugins/bundle.zip");

    fs.rmSync(path.join(tempDir, "plugins", "mod.txt"));
    const result = unzipInstanceFile(tempDir, "plugins/bundle.zip");
    expect(result.extractedTo).toBe("plugins");
    expect(fs.existsSync(path.join(tempDir, "plugins", "mod.txt"))).toBe(true);
  });

  it("rejects non-zip extraction targets", () => {
    expect(() => unzipInstanceFile(tempDir, "readme.txt")).toThrow(PathSecurityError);
  });

  it("reports archive progress while streaming", async () => {
    const progressEvents: Array<{ entriesProcessed: number; bytesProcessed: number }> = [];

    await archiveInstancePaths(tempDir, ["readme.txt", "plugins"], "", undefined, (progress) => {
      progressEvents.push(progress);
    });

    expect(progressEvents.length).toBeGreaterThan(0);
    expect(progressEvents.at(-1)?.entriesProcessed).toBeGreaterThan(0);
    expect(progressEvents.at(-1)?.bytesProcessed).toBeGreaterThan(0);
  });

  it("removes partial zip files when the output stream hits ENOSPC", async () => {
    const outputPath = path.join(tempDir, "partial.zip");
    fs.writeFileSync(outputPath, "PK\x03\x04partial archive bytes");

    vi.spyOn(fs, "createWriteStream").mockImplementation(() => {
      const stream = Object.assign(new PassThrough(), new EventEmitter()) as unknown as fs.WriteStream;
      queueMicrotask(() => {
        const error = new Error("No space left on device") as NodeJS.ErrnoException;
        error.code = "ENOSPC";
        stream.emit("error", error);
      });
      return stream;
    });

    await expect(
      archiveInstancePaths(tempDir, ["readme.txt"], "", "partial.zip"),
    ).rejects.toThrow("Not enough disk space to create archive.");

    expect(fs.existsSync(outputPath)).toBe(false);
  });

  it("removes partial zip files when the output stream fails", async () => {
    const outputPath = path.join(tempDir, "partial.zip");
    fs.writeFileSync(outputPath, "PK\x03\x04partial archive bytes");

    vi.spyOn(fs, "createWriteStream").mockImplementation(() => {
      const stream = Object.assign(new PassThrough(), new EventEmitter()) as unknown as fs.WriteStream;
      queueMicrotask(() => {
        stream.emit("error", new Error("Output stream failed"));
      });
      return stream;
    });

    await expect(
      archiveInstancePaths(tempDir, ["readme.txt"], "", "partial.zip"),
    ).rejects.toThrow("Output stream failed");

    expect(fs.existsSync(outputPath)).toBe(false);
  });

  it(
    "archives directories with 10k+ files",
    async () => {
      const regionDir = path.join(tempDir, "region");
      fs.mkdirSync(regionDir);

      for (let index = 0; index < 10_000; index += 1) {
        fs.writeFileSync(path.join(regionDir, `r.${index}.mca`), "region-data");
      }

      const result = await archiveInstancePaths(tempDir, ["region"], "", "world-region.zip");
      const archivePath = path.join(tempDir, result.archivePath);

      expect(fs.existsSync(archivePath)).toBe(true);

      const zip = new AdmZip(archivePath);
      const fileEntries = zip.getEntries().filter((entry) => !entry.isDirectory);
      expect(fileEntries.length).toBe(10_000);
    },
    120_000,
  );
});
