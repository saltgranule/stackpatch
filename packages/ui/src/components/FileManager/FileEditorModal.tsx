import { useCallback, useEffect, useState } from "react";
import { fetchInstanceFileContent, saveInstanceFileContent } from "../../api/client";
import { ConsoleCard } from "../ConsoleCard";
import form from "../../styles/consoleForm.module.css";
import styles from "./FileEditorModal.module.css";

interface FileEditorModalProps {
  instanceId: string;
  filePath: string;
  fileName: string;
  canWrite: boolean;
  onClose: () => void;
  onSaved: () => void;
}

export function FileEditorModal({
  instanceId,
  filePath,
  fileName,
  canWrite,
  onClose,
  onSaved,
}: FileEditorModalProps) {
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    fetchInstanceFileContent(instanceId, filePath)
      .then((result) => {
        if (active) {
          setContent(result.content);
          setError(null);
        }
      })
      .catch((loadError) => {
        if (active) {
          setError(loadError instanceof Error ? loadError.message : "Failed to load file");
        }
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [instanceId, filePath]);

  const handleSave = useCallback(async () => {
    if (!canWrite || loading || saving) return;

    setSaving(true);
    setError(null);
    try {
      await saveInstanceFileContent(instanceId, filePath, content);
      onSaved();
      onClose();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Failed to save file");
    } finally {
      setSaving(false);
    }
  }, [canWrite, content, filePath, instanceId, loading, onClose, onSaved, saving]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
      if (canWrite && (event.ctrlKey || event.metaKey) && event.key === "s") {
        event.preventDefault();
        void handleSave();
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [canWrite, handleSave, onClose]);

  const hint = canWrite
    ? filePath
    : `${filePath} · read-only`;

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="file-editor-title"
        onClick={(event) => event.stopPropagation()}
      >
        <ConsoleCard
          className={styles.card}
          tabLabel={<span id="file-editor-title">{fileName}</span>}
          hint={hint}
          elevated
        >
          <div className={styles.shell}>
            {error && <p className={form.error}>{error}</p>}

            {loading ? (
              <p className={styles.state}>Loading file…</p>
            ) : (
              <div className={styles.editorPane}>
                <textarea
                  className={styles.editor}
                  value={content}
                  onChange={(event) => setContent(event.target.value)}
                  readOnly={!canWrite}
                  spellCheck={false}
                  autoFocus
                />
              </div>
            )}

            <div className={`${form.actions} ${styles.actions}`}>
              <button
                type="button"
                className={form.actionSecondary}
                onClick={onClose}
              >
                Close
              </button>
              {canWrite ? (
                <button
                  type="button"
                  className={form.actionPrimary}
                  onClick={() => void handleSave()}
                  disabled={loading || saving}
                >
                  {saving ? "Saving…" : "Save"}
                </button>
              ) : (
                <span className={styles.readOnlyBadge}>View only</span>
              )}
            </div>
          </div>
        </ConsoleCard>
      </div>
    </div>
  );
}
