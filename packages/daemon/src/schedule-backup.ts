import fs from "node:fs";
import path from "node:path";
import AdmZip from "adm-zip";

export function createScheduleBackup(workingDirectory: string): string {
  if (!fs.existsSync(workingDirectory)) {
    throw new Error("Working directory does not exist");
  }

  const backupsDir = path.join(workingDirectory, ".stackpatch-backups");
  fs.mkdirSync(backupsDir, { recursive: true });

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const archivePath = path.join(backupsDir, `schedule-backup-${stamp}.zip`);

  const zip = new AdmZip();
  zip.addLocalFolder(workingDirectory, "", (entryName) => {
    const normalized = entryName.replace(/\\/g, "/");
    return !normalized.startsWith(".stackpatch-backups/");
  });
  zip.writeZip(archivePath);

  return archivePath;
}
