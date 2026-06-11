import { useCallback, useEffect, useRef, useState } from "react";
import { isEditableTextFile, type FileEntry, type Instance } from "@stackpatch/shared";
import {
  archiveInstanceFiles,
  createInstanceEntry,
  deleteInstanceFiles,
  fetchUploadConfig,
  getInstanceFileDownloadUrl,
  listInstanceFiles,
  renameInstanceEntry,
  unzipInstanceFile,
  uploadInstanceFiles,
} from "../../api/client";
import { useNotifications } from "../../hooks/useNotifications";
import { MATERIAL_ICONS, MaterialIcon, type MaterialIconName } from "../../icons";
import { Dropdown } from "../Dropdown/Dropdown";
import { ScrollArea } from "../ScrollArea/ScrollArea";
import { FileEditorModal } from "./FileEditorModal";
import styles from "./FileManager.module.css";

interface FileManagerProps {
  instance: Instance;
  canWrite: boolean;
}

interface OpenEditorState {
  path: string;
  name: string;
}

type FileAction = "delete" | "archive" | "unzip" | "rename";

type NewAction = "directory" | "file";

const NEW_OPTIONS = [
  { value: "directory", label: "New directory" },
  { value: "file", label: "New blank file" },
] as const satisfies readonly { value: NewAction; label: string }[];

function formatSize(bytes: number | null): string {
  if (bytes === null) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatPathLabel(path: string): string {
  return path || "/";
}

function getParentPath(path: string): string {
  if (!path) return "";
  const parts = path.split("/").filter(Boolean);
  parts.pop();
  return parts.join("/");
}

function isZipFile(name: string): boolean {
  return name.toLowerCase().endsWith(".zip");
}

function getFileTypeIcon(entry: FileEntry): MaterialIconName {
  if (entry.type === "directory") {
    return MATERIAL_ICONS.folder;
  }
  if (isZipFile(entry.name)) {
    return MATERIAL_ICONS.folderZip;
  }
  if (isEditableTextFile(entry.name)) {
    return MATERIAL_ICONS.description;
  }
  return MATERIAL_ICONS.insertDriveFile;
}

interface RowActionButtonProps {
  icon: MaterialIconName;
  label: string;
  onClick: () => void;
  disabled?: boolean;
}

function RowActionButton({ icon, label, onClick, disabled }: RowActionButtonProps) {
  return (
    <button
      type="button"
      className={styles.rowAction}
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
      disabled={disabled}
      aria-label={label}
      title={label}
    >
      <MaterialIcon name={icon} size={18} />
    </button>
  );
}

interface FileRowActionsProps {
  entry: FileEntry;
  canWrite: boolean;
  busy: boolean;
  onDownload: (entry: FileEntry) => void;
  onEdit: (entry: FileEntry) => void;
  onRename: (entry: FileEntry) => void;
  onDelete: (entry: FileEntry) => void;
  onUnzip: (entry: FileEntry) => void;
}

function FileRowActions({
  entry,
  canWrite,
  busy,
  onDownload,
  onEdit,
  onRename,
  onDelete,
  onUnzip,
}: FileRowActionsProps) {
  const isDirectory = entry.type === "directory";
  const isEditable = !isDirectory && isEditableTextFile(entry.name);
  const isZip = !isDirectory && isZipFile(entry.name);

  return (
    <div className={styles.fileActions}>
      {isEditable && (
        <RowActionButton
          icon={MATERIAL_ICONS.edit}
          label="Edit"
          onClick={() => onEdit(entry)}
          disabled={busy}
        />
      )}
      {!isDirectory && (
        <RowActionButton
          icon={MATERIAL_ICONS.download}
          label="Download"
          onClick={() => onDownload(entry)}
          disabled={busy}
        />
      )}
      {canWrite && (
        <>
          <RowActionButton
            icon={MATERIAL_ICONS.driveFileRenameOutline}
            label="Rename"
            onClick={() => onRename(entry)}
            disabled={busy}
          />
          {isZip && (
            <RowActionButton
              icon={MATERIAL_ICONS.unarchive}
              label="Unzip"
              onClick={() => onUnzip(entry)}
              disabled={busy}
            />
          )}
          <RowActionButton
            icon={MATERIAL_ICONS.delete}
            label="Delete"
            onClick={() => onDelete(entry)}
            disabled={busy}
          />
        </>
      )}
    </div>
  );
}

export function FileManager({ instance, canWrite }: FileManagerProps) {
  const { notifySuccess, notifyError } = useNotifications();
  const [currentPath, setCurrentPath] = useState("");
  const [entries, setEntries] = useState<FileEntry[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [openEditor, setOpenEditor] = useState<OpenEditorState | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [maxUploadFileSizeMb, setMaxUploadFileSizeMb] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const allSelected = entries.length > 0 && entries.every((entry) => selected.has(entry.path));
  const canGoBack = currentPath.length > 0;
  const parentPath = getParentPath(currentPath);
  const selectedPaths = [...selected];
  const selectedEntries = entries.filter((entry) => selected.has(entry.path));
  const canArchive = selectedPaths.length > 0;
  const canDelete = selectedPaths.length > 0;
  const canRename = selectedPaths.length === 1;
  const canUnzip =
    selectedPaths.length === 1 &&
    selectedEntries[0]?.type === "file" &&
    isZipFile(selectedEntries[0].name);
  const actionsDisabled = actionBusy || (!canArchive && !canDelete && !canUnzip && !canRename);
  const newDisabled = actionBusy || uploading;

  const actionOptions = [
    { value: "rename" as const, label: "Rename", disabled: !canRename },
    { value: "archive" as const, label: "Archive to ZIP", disabled: !canArchive },
    { value: "unzip" as const, label: "Unzip", disabled: !canUnzip },
    { value: "delete" as const, label: "Delete", disabled: !canDelete },
  ];

  const loadDirectory = useCallback(async (path: string) => {
    setLoading(true);
    setError(null);
    try {
      const result = await listInstanceFiles(instance.id, path);
      setEntries(result.entries);
      setCurrentPath(result.path);
      setSelected(new Set());
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load files");
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }, [instance.id]);

  useEffect(() => {
    void loadDirectory("");
  }, [loadDirectory]);

  useEffect(() => {
    fetchUploadConfig()
      .then((config) => setMaxUploadFileSizeMb(config.maxUploadFileSizeMb))
      .catch(() => undefined);
  }, []);

  function validateUploadSize(files: FileList | File[]): string | null {
    if (maxUploadFileSizeMb === null) {
      return null;
    }
    const maxBytes = maxUploadFileSizeMb * 1024 * 1024;
    for (const file of files) {
      if (file.size > maxBytes) {
        return `"${file.name}" exceeds the maximum upload size of ${maxUploadFileSizeMb} MB`;
      }
    }
    return null;
  }

  function toggleSelected(path: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  }

  function toggleSelectAll() {
    if (allSelected) {
      setSelected(new Set());
      return;
    }
    setSelected(new Set(entries.map((entry) => entry.path)));
  }

  function openEntry(entry: FileEntry) {
    if (entry.type === "directory") {
      void loadDirectory(entry.path);
      return;
    }
    if (isEditableTextFile(entry.name)) {
      setOpenEditor({ path: entry.path, name: entry.name });
    }
  }

  function downloadEntry(entry: FileEntry) {
    if (entry.type === "directory") {
      return;
    }
    window.location.assign(getInstanceFileDownloadUrl(instance.id, entry.path));
  }

  async function handleUpload(files: FileList | File[] | null) {
    if (!files || files.length === 0 || !canWrite) return;

    const sizeError = validateUploadSize(files);
    if (sizeError) {
      setError(sizeError);
      return;
    }

    setUploading(true);
    setError(null);
    try {
      await uploadInstanceFiles(instance.id, currentPath, files);
      await loadDirectory(currentPath);
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  async function deletePaths(paths: string[], label: string) {
    if (paths.length === 0 || !canWrite) return;

    const confirmed = window.confirm(
      paths.length === 1
        ? `Delete "${label}"? This cannot be undone.`
        : `Delete ${paths.length} item(s)? This cannot be undone.`,
    );
    if (!confirmed) return;

    setActionBusy(true);
    setError(null);
    try {
      await deleteInstanceFiles(instance.id, paths);
      await loadDirectory(currentPath);
      notifySuccess(
        paths.length === 1 ? `"${label}" deleted` : `${paths.length} items deleted`,
        paths.length === 1
          ? "The file has been removed from the instance."
          : "The selected items have been removed from the instance.",
      );
    } catch (deleteError) {
      const message = deleteError instanceof Error ? deleteError.message : "Delete failed";
      setError(message);
      notifyError("Delete failed", message);
    } finally {
      setActionBusy(false);
    }
  }

  async function handleDelete() {
    if (!canDelete || !canWrite) return;
    const label =
      selectedPaths.length === 1 ? (selectedEntries[0]?.name ?? "this item") : "selected items";
    await deletePaths(selectedPaths, label);
  }

  async function handleDeleteEntry(entry: FileEntry) {
    await deletePaths([entry.path], entry.name);
  }

  async function handleArchive() {
    if (!canArchive || !canWrite) return;

    setActionBusy(true);
    setError(null);
    try {
      await archiveInstanceFiles(instance.id, selectedPaths, currentPath);
      await loadDirectory(currentPath);
    } catch (archiveError) {
      setError(archiveError instanceof Error ? archiveError.message : "Archive failed");
    } finally {
      setActionBusy(false);
    }
  }

  async function unzipPath(zipPath: string) {
    if (!canWrite) return;

    setActionBusy(true);
    setError(null);
    try {
      const result = await unzipInstanceFile(instance.id, zipPath);
      await loadDirectory(result.extractedTo);
    } catch (unzipError) {
      setError(unzipError instanceof Error ? unzipError.message : "Unzip failed");
    } finally {
      setActionBusy(false);
    }
  }

  async function handleUnzip() {
    if (!canUnzip || !canWrite) return;
    const zipPath = selectedPaths[0];
    if (!zipPath) return;
    await unzipPath(zipPath);
  }

  async function handleUnzipEntry(entry: FileEntry) {
    if (entry.type !== "file" || !isZipFile(entry.name)) return;
    await unzipPath(entry.path);
  }

  async function renameEntry(entry: FileEntry) {
    if (!canWrite) return;

    const newName = window.prompt(`Rename "${entry.name}" to:`, entry.name);
    if (!newName || newName.trim() === entry.name) return;

    setActionBusy(true);
    setError(null);
    try {
      const renamed = await renameInstanceEntry(instance.id, entry.path, newName.trim());
      await loadDirectory(currentPath);
      notifySuccess(`Renamed to "${renamed.name}"`, `"${entry.name}" was renamed successfully.`);
    } catch (renameError) {
      const message = renameError instanceof Error ? renameError.message : "Rename failed";
      setError(message);
      notifyError("Rename failed", message);
    } finally {
      setActionBusy(false);
    }
  }

  async function handleRename() {
    if (!canRename || !canWrite) return;
    const entry = selectedEntries[0];
    if (!entry) return;
    await renameEntry(entry);
  }

  async function handleCreate(type: "file" | "directory") {
    if (!canWrite) return;

    const label = type === "directory" ? "New directory name" : "New file name";
    const name = window.prompt(label);
    if (!name?.trim()) return;

    setActionBusy(true);
    setError(null);
    try {
      const created = await createInstanceEntry(instance.id, currentPath, name.trim(), type);
      await loadDirectory(currentPath);
      if (created.type === "file" && isEditableTextFile(created.name)) {
        setOpenEditor({ path: created.path, name: created.name });
      }
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Create failed");
    } finally {
      setActionBusy(false);
    }
  }

  async function handleAction(action: FileAction) {
    switch (action) {
      case "delete":
        await handleDelete();
        break;
      case "archive":
        await handleArchive();
        break;
      case "unzip":
        await handleUnzip();
        break;
      case "rename":
        await handleRename();
        break;
      default:
        break;
    }
  }

  return (
    <div className={styles.page}>
      <article className={styles.filesCard}>
        <div className={styles.filesCardTabSlot}>
          <span className={styles.filesCardTab}>file explorer</span>
        </div>
        <div className={styles.filesCardBody}>
          <div className={styles.toolbar}>
            <div className={styles.currentDir}>
              <span className={styles.currentDirLabel}>Current dir</span>
              <span className={styles.currentDirPath} title={formatPathLabel(currentPath)}>
                {formatPathLabel(currentPath)}
              </span>
            </div>
            <div className={styles.actions}>
              {canWrite && (
                <>
                  <Dropdown<NewAction>
                    className={styles.toolbarDropdown}
                    variant="console"
                    options={NEW_OPTIONS}
                    triggerLabel={actionBusy ? "Working…" : "New"}
                    disabled={newDisabled}
                    aria-label="Create new"
                    onChange={(action) => void handleCreate(action)}
                  />
                  <button
                    type="button"
                    className={styles.actionPrimary}
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading}
                  >
                    {uploading ? "Uploading…" : "Upload"}
                  </button>
                  <Dropdown<FileAction>
                    className={styles.toolbarDropdown}
                    variant="console"
                    options={actionOptions}
                    triggerLabel={actionBusy ? "Working…" : "Actions"}
                    disabled={actionsDisabled}
                    aria-label="File actions"
                    onChange={(action) => void handleAction(action)}
                  />
                </>
              )}
            </div>
          </div>

          {error && <p className={styles.error}>{error}</p>}

          <ScrollArea
            variant="console"
            className={`${styles.listPane} ${dragging ? styles.listPaneDragging : ""}`}
            onDragEnter={(event) => {
              if (!canWrite) return;
              event.preventDefault();
              setDragging(true);
            }}
            onDragOver={(event) => {
              if (!canWrite) return;
              event.preventDefault();
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(event) => {
              event.preventDefault();
              setDragging(false);
              if (!canWrite) return;
              void handleUpload(event.dataTransfer.files);
            }}
          >
            {loading ? (
              <p className={styles.state}>Loading files…</p>
            ) : (
              <div className={styles.fileTable}>
                {(entries.length > 0 || canGoBack) && (
                  <div className={styles.fileHeaderRow}>
                    <div className={styles.rowLead}>
                      {canWrite && entries.length > 0 ? (
                        <label className={styles.selectAll}>
                          <input
                            type="checkbox"
                            className={styles.checkbox}
                            checked={allSelected}
                            onChange={toggleSelectAll}
                          />
                          <span className={styles.selectAllLabel}>Select all</span>
                        </label>
                      ) : null}
                    </div>
                    <div className={styles.rowMeta}>
                      <span className={`${styles.fileMeta} ${styles.fileMetaHeader}`}>Size</span>
                      <span className={`${styles.fileMeta} ${styles.fileMetaHeader}`}>Modified</span>
                    </div>
                    <div className={styles.rowActions} aria-hidden />
                  </div>
                )}

                {canGoBack && (
                  <div className={styles.fileRow}>
                    <div className={styles.rowLead}>
                      <button
                        type="button"
                        className={styles.fileName}
                        onClick={() => void loadDirectory(parentPath)}
                      >
                        <MaterialIcon name={MATERIAL_ICONS.folderOpen} className={styles.fileTypeIcon} />
                        <span>..</span>
                      </button>
                    </div>
                    <div className={styles.rowMeta}>
                      <span className={styles.fileMeta} />
                      <span className={styles.fileMeta} />
                    </div>
                    <div className={styles.rowActions} aria-hidden />
                  </div>
                )}

                {entries.length === 0 ? (
                  <p className={styles.state}>
                    {canWrite
                      ? maxUploadFileSizeMb !== null
                        ? `Empty folder. Drop files here or upload (max ${maxUploadFileSizeMb} MB per file).`
                        : "Empty folder. Drop files here or upload."
                      : "Empty folder."}
                  </p>
                ) : (
                  entries.map((entry) => {
                    const isSelected = selected.has(entry.path);
                    return (
                      <div
                        key={entry.path}
                        className={`${styles.fileRow} ${isSelected ? styles.fileRowSelected : ""}`}
                      >
                        <div className={styles.rowLead}>
                          {canWrite ? (
                            <input
                              type="checkbox"
                              className={styles.checkbox}
                              checked={isSelected}
                              onChange={() => toggleSelected(entry.path)}
                              aria-label={`Select ${entry.name}`}
                            />
                          ) : null}
                          <button
                            type="button"
                            className={styles.fileName}
                            onClick={() => openEntry(entry)}
                          >
                            <MaterialIcon
                              name={getFileTypeIcon(entry)}
                              className={styles.fileTypeIcon}
                            />
                            <span>{entry.name}</span>
                          </button>
                        </div>
                        <div className={styles.rowMeta}>
                          <span className={styles.fileMeta}>{formatSize(entry.size)}</span>
                          <span className={styles.fileMeta}>
                            {new Date(entry.modifiedAt).toLocaleString()}
                          </span>
                        </div>
                        <div className={styles.rowActions}>
                          <FileRowActions
                            entry={entry}
                            canWrite={canWrite}
                            busy={actionBusy}
                            onDownload={downloadEntry}
                            onEdit={(item) => setOpenEditor({ path: item.path, name: item.name })}
                            onRename={(item) => void renameEntry(item)}
                            onDelete={(item) => void handleDeleteEntry(item)}
                            onUnzip={(item) => void handleUnzipEntry(item)}
                          />
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            )}
          </ScrollArea>
        </div>
      </article>

      <input
        ref={fileInputRef}
        type="file"
        multiple
        className={styles.hiddenInput}
        onChange={(event) => {
          void handleUpload(event.target.files);
          event.target.value = "";
        }}
      />

      {openEditor && (
        <FileEditorModal
          instanceId={instance.id}
          filePath={openEditor.path}
          fileName={openEditor.name}
          canWrite={canWrite}
          onClose={() => setOpenEditor(null)}
          onSaved={() => void loadDirectory(currentPath)}
        />
      )}
    </div>
  );
}
