export const MATERIAL_ICONS = {
  folder: "folder",
  folderOpen: "folder_open",
  description: "description",
  insertDriveFile: "insert_drive_file",
  folderZip: "folder_zip",
  download: "download",
  delete: "delete",
  driveFileRenameOutline: "drive_file_rename_outline",
  unarchive: "unarchive",
  edit: "edit",
  close: "close",
  save: "save",
  accountCircle: "account_circle",
} as const;

export type MaterialIconName = (typeof MATERIAL_ICONS)[keyof typeof MATERIAL_ICONS];
