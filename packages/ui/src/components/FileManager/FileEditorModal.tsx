import { useEffect, useState } from "react";
import { fetchInstanceFileContent, saveInstanceFileContent } from "../../api/client";
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

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  async function handleSave() {
    if (!canWrite) return;

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
  }

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div
        className={styles.modal}
        role="dialog"
        aria-modal="true"
        aria-labelledby="file-editor-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className={styles.header}>
          <div>
            <h2 id="file-editor-title" className={styles.title}>
              {fileName}
            </h2>
            <p className={styles.path}>{filePath}</p>
          </div>
          <button type="button" className={styles.close} onClick={onClose}>
            Close
          </button>
        </header>

        {error && <p className={styles.error}>{error}</p>}

        {loading ? (
          <p className={styles.loading}>Loading file…</p>
        ) : (
          <textarea
            className={styles.editor}
            value={content}
            onChange={(event) => setContent(event.target.value)}
            readOnly={!canWrite}
            spellCheck={false}
          />
        )}

        <footer className={styles.footer}>
          {canWrite ? (
            <button
              type="button"
              className={styles.save}
              onClick={() => void handleSave()}
              disabled={loading || saving}
            >
              {saving ? "Saving…" : "Save"}
            </button>
          ) : (
            <span className={styles.readOnly}>Read-only</span>
          )}
        </footer>
      </div>
    </div>
  );
}
