import { useCallback, useEffect, useRef, useState } from "react";
import type { AuditLogEntry } from "@stackpatch/shared";
import { fetchAuditLogs, downloadAuthenticatedFile, getAuditLogDownloadUrl } from "../../api/client";
import { ActionCard } from "../ActionCard/ActionCard";
import { ScrollArea } from "../ScrollArea/ScrollArea";
import cardStyles from "../../styles/logViewCards.module.css";
import stackStyles from "../../styles/logViewStack.module.css";
import styles from "./ActivityLogs.module.css";

const POLL_INTERVAL_MS = 5000;

function formatTimestamp(value: string): string {
  return new Date(value).toLocaleTimeString();
}

interface ActivityLogsProps {
  onOpenUsers: () => void;
}

export function ActivityLogs({ onOpenUsers }: ActivityLogsProps) {
  const [entries, setEntries] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const previousCountRef = useRef(0);

  const loadEntries = useCallback(async () => {
    try {
      const result = await fetchAuditLogs();
      setEntries(result.entries);
      setError(null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load activity log");
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadEntries();
    const timer = setInterval(() => void loadEntries(), POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [loadEntries]);

  useEffect(() => {
    if (entries.length > previousCountRef.current) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
    previousCountRef.current = entries.length;
  }, [entries]);

  async function handleDownload() {
    setDownloading(true);
    try {
      await downloadAuthenticatedFile(getAuditLogDownloadUrl(), "stackpatch-activity-log.txt");
    } catch (downloadError) {
      setError(downloadError instanceof Error ? downloadError.message : "Download failed");
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div className={styles.page}>
      <div className={stackStyles.consoleStack}>
        <div className={styles.terminalWrap}>
          <div className={styles.tabSlot}>
            <button
              type="button"
              className={styles.downloadTab}
              disabled={downloading}
              onClick={() => void handleDownload()}
            >
              {downloading ? "Downloading…" : "Download logs"}
            </button>
          </div>
          <div className={styles.terminal}>
            <ScrollArea variant="console" className={styles.output}>
            {loading ? (
              <p className={styles.systemLine}>Loading activity…</p>
            ) : error ? (
              <p className={styles.systemLine}>{error}</p>
            ) : entries.length === 0 ? (
              <p className={styles.empty}>No activity recorded yet.</p>
            ) : (
              entries.map((entry) => (
                <div key={entry.id} className={styles.line}>
                  <span className={styles.timestamp}>{formatTimestamp(entry.createdAt)}</span>
                  <span className={styles.text}>{entry.message}</span>
                </div>
              ))
            )}
            <div ref={bottomRef} />
            </ScrollArea>
          </div>
        </div>
      </div>

      <div className={cardStyles.cards}>
        <ActionCard
          title="Users"
          hint="Manage panel accounts and instance access."
          actionLabel="Open Users"
          onAction={onOpenUsers}
        />
      </div>
    </div>
  );
}
