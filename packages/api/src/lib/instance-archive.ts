import fs from "node:fs";
import path from "node:path";
import { ZipArchive, type Archiver, type ArchiverError, type ProgressData } from "archiver";
import AdmZip from "adm-zip";
import { PathSecurityError, isPathInsideRoot } from "@stackpatch/shared";
import {
  resolveInstanceFilePath,
  sanitizeFileName,
  toRelativeFilePath,
} from "./instance-files.js";

export interface ArchiveProgress {
  entriesProcessed: number;
  bytesProcessed: number;
}

function assertZipEntrySafe(targetDir: string, entryName: string, workingRoot: string): void {
  const destination = path.resolve(targetDir, entryName);
  if (!isPathInsideRoot(destination, workingRoot)) {
    throw new PathSecurityError("Zip entry escapes the instance working directory");
  }
}

function defaultArchiveName(): string {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  return `archive-${stamp}.zip`;
}

function rejectOutputStreamError(error: NodeJS.ErrnoException): Error {
  if (error.code === "ENOSPC") {
    return new Error("Not enough disk space to create archive.");
  }
  return error;
}

async function streamArchiveToFile(
  outputPath: string,
  populate: (archive: Archiver) => void,
  onProgress?: (progress: ArchiveProgress) => void,
): Promise<void> {
  await fs.promises.mkdir(path.dirname(outputPath), { recursive: true });

  return new Promise((resolve, reject) => {
    let settled = false;
    const output = fs.createWriteStream(outputPath);
    const archive = new ZipArchive({ zlib: { level: 6 } });

    const fail = (error: unknown) => {
      if (settled) {
        return;
      }
      settled = true;
      archive.abort();
      output.destroy();
      void fs.promises
        .rm(outputPath, { force: true })
        .catch(() => undefined)
        .finally(() => {
          reject(error instanceof Error ? error : new Error("Archive failed"));
        });
    };

    output.on("close", () => {
      if (settled) {
        return;
      }
      settled = true;
      resolve();
    });

    output.on("error", (error: NodeJS.ErrnoException) => {
      if (settled) {
        return;
      }
      fail(rejectOutputStreamError(error));
    });

    archive.on("error", (error: ArchiverError) => {
      fail(error);
    });

    archive.on("warning", (error: ArchiverError) => {
      if (error.code !== "ENOENT") {
        fail(error);
      }
    });

    if (onProgress) {
      archive.on("progress", (progress: ProgressData) => {
        onProgress({
          entriesProcessed: progress.entries.processed,
          bytesProcessed: progress.fs.processedBytes,
        });
      });
    }

    archive.pipe(output);
    populate(archive);
    void archive.finalize().catch(fail);
  });
}

export async function archiveInstancePaths(
  workingDirectory: string,
  paths: string[],
  outputDirectoryPath = "",
  outputName?: string,
  onProgress?: (progress: ArchiveProgress) => void,
): Promise<{ archivePath: string; archived: string[] }> {
  if (paths.length === 0) {
    throw new PathSecurityError("Select at least one item to archive");
  }

  const root = path.resolve(workingDirectory);
  const archived: string[] = [];
  const entries: Array<{ absolutePath: string; entryName: string; isDirectory: boolean }> = [];

  for (const entryPath of paths) {
    const absolutePath = resolveInstanceFilePath(workingDirectory, entryPath);
    if (!fs.existsSync(absolutePath)) {
      continue;
    }

    const stat = fs.statSync(absolutePath);
    entries.push({
      absolutePath,
      entryName: path.basename(absolutePath),
      isDirectory: stat.isDirectory(),
    });
    archived.push(entryPath.replace(/\\/g, "/"));
  }

  if (archived.length === 0) {
    throw new PathSecurityError("No files found to archive");
  }

  const archiveFileName = sanitizeFileName(outputName?.trim() || defaultArchiveName());
  if (!archiveFileName.toLowerCase().endsWith(".zip")) {
    throw new PathSecurityError("Archive name must end with .zip");
  }

  const outputDirectory = resolveInstanceFilePath(workingDirectory, outputDirectoryPath);
  const outputDirectoryStat = fs.statSync(outputDirectory);
  if (!outputDirectoryStat.isDirectory()) {
    throw new PathSecurityError("Archive directory does not exist");
  }

  const outputPath = path.join(outputDirectory, archiveFileName);

  if (!isPathInsideRoot(outputPath, root)) {
    throw new PathSecurityError("Archive path is outside the instance working directory");
  }

  await streamArchiveToFile(
    outputPath,
    (archive) => {
      for (const entry of entries) {
        if (entry.isDirectory) {
          archive.directory(entry.absolutePath, entry.entryName);
        } else {
          archive.file(entry.absolutePath, { name: entry.entryName });
        }
      }
    },
    onProgress,
  );

  return {
    archivePath: toRelativeFilePath(workingDirectory, outputPath),
    archived,
  };
}

export function unzipInstanceFile(
  workingDirectory: string,
  relativePath: string,
): { extractedTo: string; entries: number } {
  const filePath = resolveInstanceFilePath(workingDirectory, relativePath);

  if (!fs.existsSync(filePath)) {
    throw new PathSecurityError("File not found");
  }

  const stat = fs.statSync(filePath);
  if (!stat.isFile()) {
    throw new PathSecurityError("Path is not a file");
  }

  if (!filePath.toLowerCase().endsWith(".zip")) {
    throw new PathSecurityError("Only .zip files can be extracted");
  }

  const root = path.resolve(workingDirectory);
  const extractTo = path.dirname(filePath);
  const zip = new AdmZip(filePath);

  for (const entry of zip.getEntries()) {
    if (entry.isDirectory) {
      assertZipEntrySafe(extractTo, entry.entryName, root);
      continue;
    }
    assertZipEntrySafe(extractTo, entry.entryName, root);
  }

  zip.extractAllTo(extractTo, true);

  return {
    extractedTo: toRelativeFilePath(workingDirectory, extractTo),
    entries: zip.getEntries().length,
  };
}
