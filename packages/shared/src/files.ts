export interface FileEntry {
  name: string;
  path: string;
  type: "file" | "directory";
  size: number | null;
  modifiedAt: string;
}

export interface ListFilesResult {
  path: string;
  entries: FileEntry[];
}

export interface FileContentResult {
  path: string;
  content: string;
  size: number;
}

export interface InstanceDirectorySize {
  totalBytes: number;
}

const NON_EDITABLE_FILENAMES = new Set([".ds_store", "thumbs.db", "desktop.ini"]);

const EXTENSIONLESS_EDITABLE_NAMES = new Set([
  "dockerfile",
  "makefile",
  "license",
  "readme",
  "changelog",
  "procfile",
  "gemfile",
  "rakefile",
  "vagrantfile",
  "brewfile",
]);

const NON_EDITABLE_EXTENSIONS = new Set([
  ".7z",
  ".aac",
  ".avi",
  ".bin",
  ".bmp",
  ".bz2",
  ".class",
  ".com",
  ".dat",
  ".db",
  ".dll",
  ".dylib",
  ".eot",
  ".exe",
  ".flac",
  ".gif",
  ".gz",
  ".ico",
  ".img",
  ".iso",
  ".jar",
  ".jpeg",
  ".jpg",
  ".lib",
  ".m4a",
  ".mkv",
  ".mov",
  ".mp3",
  ".mp4",
  ".o",
  ".obj",
  ".ogg",
  ".otf",
  ".pdf",
  ".png",
  ".pyc",
  ".pyo",
  ".rar",
  ".so",
  ".sqlite",
  ".sqlite3",
  ".tar",
  ".tgz",
  ".ttf",
  ".war",
  ".wav",
  ".webm",
  ".webp",
  ".woff",
  ".woff2",
  ".xz",
  ".zip",
  ".zst",
]);

export function isEditableTextFile(name: string): boolean {
  const lower = name.toLowerCase();
  if (NON_EDITABLE_FILENAMES.has(lower)) {
    return false;
  }

  const dotIndex = lower.lastIndexOf(".");
  if (dotIndex < 0) {
    return EXTENSIONLESS_EDITABLE_NAMES.has(lower);
  }

  if (dotIndex === 0) {
    return true;
  }

  const extension = lower.slice(dotIndex);
  return !NON_EDITABLE_EXTENSIONS.has(extension);
}
