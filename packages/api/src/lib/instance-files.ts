import fs from "node:fs";
import path from "node:path";
import type { FileEntry } from "@stackpatch/shared";
import {
  PathSecurityError,
  assertPathInputSafe,
  isEditableTextFile,
  isPathInsideRoot,
} from "@stackpatch/shared";

export const MAX_EDITABLE_FILE_BYTES = 512 * 1024;

export function sanitizeFileName(name: string): string {
  const base = path.basename(name.replace(/\\/g, "/"));
  if (!base || base === "." || base === "..") {
    throw new PathSecurityError("Invalid file name");
  }
  assertPathInputSafe(base, "File name");
  return base;
}

export function resolveInstanceFilePath(workingDirectory: string, relativePath = ""): string {
  const root = path.resolve(workingDirectory);
  const normalized = relativePath.trim().replace(/\\/g, "/");

  if (!normalized || normalized === ".") {
    return root;
  }

  assertPathInputSafe(normalized, "Path");
  const resolved = path.resolve(root, normalized);

  if (!isPathInsideRoot(resolved, root)) {
    throw new PathSecurityError("Path is outside the instance working directory");
  }

  return resolved;
}

export function toRelativeFilePath(workingDirectory: string, absolutePath: string): string {
  const relative = path.relative(path.resolve(workingDirectory), path.resolve(absolutePath));
  return relative.split(path.sep).join("/");
}

export function getDirectorySize(workingDirectory: string): number {
  const root = path.resolve(workingDirectory);
  if (!fs.existsSync(root)) {
    return 0;
  }

  let total = 0;
  const stack = [root];

  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) {
      continue;
    }

    const entries = fs.readdirSync(current, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
        continue;
      }

      if (entry.isFile()) {
        total += fs.statSync(fullPath).size;
      }
    }
  }

  return total;
}

export function listDirectory(workingDirectory: string, relativePath = ""): FileEntry[] {
  const directoryPath = resolveInstanceFilePath(workingDirectory, relativePath);

  if (!fs.existsSync(directoryPath)) {
    throw new PathSecurityError("Directory does not exist");
  }

  const stat = fs.statSync(directoryPath);
  if (!stat.isDirectory()) {
    throw new PathSecurityError("Path is not a directory");
  }

  const entries = fs.readdirSync(directoryPath, { withFileTypes: true });
  const mapped = entries.map((entry) => {
    const absolutePath = path.join(directoryPath, entry.name);
    const entryStat = fs.statSync(absolutePath);
    return {
      name: entry.name,
      path: toRelativeFilePath(workingDirectory, absolutePath),
      type: entry.isDirectory() ? "directory" : "file",
      size: entry.isDirectory() ? null : entryStat.size,
      modifiedAt: entryStat.mtime.toISOString(),
    } satisfies FileEntry;
  });

  return mapped.sort((left, right) => {
    if (left.type !== right.type) {
      return left.type === "directory" ? -1 : 1;
    }
    return left.name.localeCompare(right.name, undefined, { sensitivity: "base" });
  });
}

export function readEditableFile(
  workingDirectory: string,
  relativePath: string,
): { path: string; content: string; size: number } {
  const filePath = resolveInstanceFilePath(workingDirectory, relativePath);

  if (!fs.existsSync(filePath)) {
    throw new PathSecurityError("File not found");
  }

  const stat = fs.statSync(filePath);
  if (!stat.isFile()) {
    throw new PathSecurityError("Path is not a file");
  }

  if (!isEditableTextFile(path.basename(filePath))) {
    throw new PathSecurityError("This file type cannot be edited in the browser");
  }

  if (stat.size > MAX_EDITABLE_FILE_BYTES) {
    throw new PathSecurityError("File is too large to edit in the browser");
  }

  const content = fs.readFileSync(filePath, "utf8");
  return {
    path: relativePath.replace(/\\/g, "/"),
    content,
    size: stat.size,
  };
}

export function createInstanceEntry(
  workingDirectory: string,
  parentPath: string,
  name: string,
  type: "file" | "directory",
): { path: string; name: string; type: "file" | "directory" } {
  const safeName = sanitizeFileName(name);
  const parentDir = resolveInstanceFilePath(workingDirectory, parentPath);

  if (!fs.existsSync(parentDir)) {
    throw new PathSecurityError("Directory does not exist");
  }

  const parentStat = fs.statSync(parentDir);
  if (!parentStat.isDirectory()) {
    throw new PathSecurityError("Path is not a directory");
  }

  const normalizedParent = parentPath.replace(/\\/g, "/").replace(/\/$/, "");
  const relativePath = normalizedParent ? `${normalizedParent}/${safeName}` : safeName;
  const destination = resolveInstanceFilePath(workingDirectory, relativePath);

  if (fs.existsSync(destination)) {
    throw new PathSecurityError("An entry with that name already exists");
  }

  if (type === "directory") {
    fs.mkdirSync(destination);
  } else {
    fs.writeFileSync(destination, "", "utf8");
  }

  return {
    path: relativePath,
    name: safeName,
    type,
  };
}

export function renameInstanceEntry(
  workingDirectory: string,
  entryPath: string,
  newName: string,
): { path: string; name: string } {
  const safeName = sanitizeFileName(newName);
  const source = resolveInstanceFilePath(workingDirectory, entryPath);

  if (!fs.existsSync(source)) {
    throw new PathSecurityError("Entry not found");
  }

  const parentDir = path.dirname(source);
  const destination = path.join(parentDir, safeName);

  if (!isPathInsideRoot(destination, path.resolve(workingDirectory))) {
    throw new PathSecurityError("Path is outside the instance working directory");
  }

  if (path.resolve(source) === path.resolve(destination)) {
    return {
      path: entryPath.replace(/\\/g, "/"),
      name: safeName,
    };
  }

  if (fs.existsSync(destination)) {
    throw new PathSecurityError("An entry with that name already exists");
  }

  fs.renameSync(source, destination);

  return {
    path: toRelativeFilePath(workingDirectory, destination),
    name: safeName,
  };
}

export function writeEditableFile(
  workingDirectory: string,
  relativePath: string,
  content: string,
): { path: string; size: number } {
  const filePath = resolveInstanceFilePath(workingDirectory, relativePath);

  if (!isEditableTextFile(path.basename(filePath))) {
    throw new PathSecurityError("This file type cannot be edited in the browser");
  }

  if (Buffer.byteLength(content, "utf8") > MAX_EDITABLE_FILE_BYTES) {
    throw new PathSecurityError("File is too large to edit in the browser");
  }

  fs.writeFileSync(filePath, content, "utf8");
  const size = fs.statSync(filePath).size;

  return {
    path: relativePath.replace(/\\/g, "/"),
    size,
  };
}
