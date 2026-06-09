import fs from "node:fs";
import path from "node:path";
import AdmZip from "adm-zip";
import { PathSecurityError, isPathInsideRoot } from "@stackpatch/shared";
import {
  resolveInstanceFilePath,
  sanitizeFileName,
  toRelativeFilePath,
} from "./instance-files.js";

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

export function archiveInstancePaths(
  workingDirectory: string,
  paths: string[],
  outputDirectoryPath = "",
  outputName?: string,
): { archivePath: string; archived: string[] } {
  if (paths.length === 0) {
    throw new PathSecurityError("Select at least one item to archive");
  }

  const root = path.resolve(workingDirectory);
  const zip = new AdmZip();
  const archived: string[] = [];

  for (const entryPath of paths) {
    const absolutePath = resolveInstanceFilePath(workingDirectory, entryPath);
    if (!fs.existsSync(absolutePath)) {
      continue;
    }

    const stat = fs.statSync(absolutePath);
    const entryName = path.basename(absolutePath);

    if (stat.isDirectory()) {
      zip.addLocalFolder(absolutePath, entryName);
    } else {
      zip.addLocalFile(absolutePath, "");
    }

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

  zip.writeZip(outputPath);

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
