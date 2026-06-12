import { useCallback, useEffect, useRef, useState } from "react";
import type { Instance, LogLine } from "@stackpatch/shared";
import {
  createConsoleSystemLine,
  getJavaRuntimeResource,
  isConsoleOutputLine,
} from "@stackpatch/shared";
import { downloadAuthenticatedFile, getConsoleLogDownloadUrl } from "../../api/client";
import { parseAnsi } from "../../lib/ansi";
import { appendConsoleLine } from "../../lib/console-log";
import { ActionCard } from "../ActionCard/ActionCard";
import { ScrollArea } from "../ScrollArea/ScrollArea";
import cardStyles from "../../styles/logViewCards.module.css";
import stackStyles from "../../styles/logViewStack.module.css";
import styles from "./Console.module.css";

interface ConsoleProps {
  instance: Instance;
  canSendInput: boolean;
  onOpenSettings: () => void;
  onOpenFiles: () => void;
  onOpenUsers: () => void;
}

type ServerMessage =
  | { type: "history"; lines: LogLine[] }
  | { type: "log"; line: LogLine }
  | { type: "error"; message: string }
  | { type: "input"; sent: boolean };

function getConsoleWsUrl(instanceId: string): string {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${window.location.host}/api/instances/${instanceId}/console/ws`;
}

function AnsiLine({ text }: { text: string }) {
  const segments = parseAnsi(text);
  return (
    <>
      {segments.map((segment, index) => (
        <span key={index} style={segment.style}>
          {segment.text}
        </span>
      ))}
    </>
  );
}

export function Console({
  instance,
  canSendInput,
  onOpenSettings,
  onOpenFiles,
  onOpenUsers,
}: ConsoleProps) {
  const [lines, setLines] = useState<LogLine[]>([]);
  const [connected, setConnected] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [input, setInput] = useState("");
  const outputRef = useRef<HTMLDivElement>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const stickToBottomRef = useRef(true);
  const pendingInitialScrollRef = useRef(true);
  const scrollFrameRef = useRef<number | null>(null);

  const scrollOutputToBottom = useCallback((behavior: ScrollBehavior = "auto") => {
    const output = outputRef.current;
    if (!output) {
      return;
    }

    if (behavior === "smooth") {
      output.scrollTo({ top: output.scrollHeight, behavior: "smooth" });
      return;
    }

    output.scrollTop = output.scrollHeight;
  }, []);

  const scheduleScrollToBottom = useCallback(() => {
    if (!stickToBottomRef.current) {
      return;
    }

    if (scrollFrameRef.current !== null) {
      return;
    }

    scrollFrameRef.current = window.requestAnimationFrame(() => {
      scrollFrameRef.current = null;
      scrollOutputToBottom("auto");
    });
  }, [scrollOutputToBottom]);

  const handleOutputScroll = useCallback(() => {
    const output = outputRef.current;
    if (!output) {
      return;
    }

    const distanceFromBottom = output.scrollHeight - output.scrollTop - output.clientHeight;
    stickToBottomRef.current = distanceFromBottom <= 48;
  }, []);

  const pushLine = useCallback((line: LogLine) => {
    if (!isConsoleOutputLine(line.text)) {
      return;
    }
    setLines((current) => appendConsoleLine(current, line));
  }, []);

  const pushMessage = useCallback(
    (message: string) => {
      pushLine(createConsoleSystemLine(message));
    },
    [pushLine],
  );

  useEffect(() => {
    let cancelled = false;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let socket: WebSocket | null = null;

    function connect() {
      if (cancelled) {
        return;
      }

      socket = new WebSocket(getConsoleWsUrl(instance.id));
      socketRef.current = socket;

      socket.onopen = () => {
        if (cancelled) {
          return;
        }
        setConnected(true);
      };

      socket.onmessage = (event) => {
        if (cancelled) {
          return;
        }

        try {
          const message = JSON.parse(event.data as string) as ServerMessage;
          if (message.type === "history") {
            setLines(message.lines.filter((line) => isConsoleOutputLine(line.text)));
            return;
          }
          if (message.type === "log") {
            pushLine(message.line);
            return;
          }
          if (message.type === "error") {
            pushMessage(message.message);
            return;
          }
          if (message.type === "input") {
            return;
          }
        } catch {
          pushMessage("Invalid console message");
        }
      };

      socket.onclose = () => {
        if (socketRef.current === socket) {
          socketRef.current = null;
        }
        if (cancelled) {
          return;
        }
        setConnected(false);
        reconnectTimer = setTimeout(connect, 3000);
      };

      socket.onerror = () => {
        if (cancelled) {
          return;
        }
        setConnected(false);
        pushMessage("Console connection failed");
      };
    }

    connect();

    return () => {
      cancelled = true;
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
      }
      if (socket) {
        socket.onopen = null;
        socket.onclose = null;
        socket.onerror = null;
        socket.onmessage = null;
        if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
          socket.close();
        }
      }
      if (socketRef.current === socket) {
        socketRef.current = null;
      }
    };
  }, [instance.id, pushLine, pushMessage]);

  useEffect(() => {
    stickToBottomRef.current = true;
    pendingInitialScrollRef.current = true;
  }, [instance.id]);

  useEffect(() => {
    return () => {
      if (scrollFrameRef.current !== null) {
        window.cancelAnimationFrame(scrollFrameRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (lines.length === 0) {
      return;
    }

    if (pendingInitialScrollRef.current) {
      scrollOutputToBottom("auto");
      pendingInitialScrollRef.current = false;
      stickToBottomRef.current = true;
      return;
    }

    scheduleScrollToBottom();
  }, [lines, scheduleScrollToBottom, scrollOutputToBottom]);

  const processActive =
    instance.status === "running" ||
    instance.status === "starting" ||
    instance.status === "stopping" ||
    Boolean(instance.pid);

  const canAcceptInput = canSendInput && connected;

  const sendCommand = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || !canAcceptInput || !socketRef.current) {
        return false;
      }
      if (socketRef.current.readyState !== WebSocket.OPEN) {
        pushMessage("Console is not connected");
        return false;
      }

      socketRef.current.send(JSON.stringify({ type: "input", text: trimmed }));
      pushLine({
        stream: "stdout",
        text: trimmed,
        timestamp: new Date().toISOString(),
      });
      return true;
    },
    [canAcceptInput, pushLine, pushMessage],
  );

  function submitCommand() {
    const text = input.trimEnd();
    if (!text.trim()) {
      return;
    }
    if (sendCommand(text)) {
      setInput("");
    }
  }

  function sendInput(event: React.FormEvent) {
    event.preventDefault();
    submitCommand();
  }

  const inputDisabled = !canAcceptInput;

  const javaRuntime = getJavaRuntimeResource(instance.applicationType);

  const inputPlaceholder = !canSendInput
    ? "Read-only access"
    : !connected
      ? "Connecting to console…"
      : processActive
        ? "Type a command…"
        : "Run a command in the instance directory…";

  async function handleDownload() {
    setDownloading(true);
    try {
      await downloadAuthenticatedFile(
        getConsoleLogDownloadUrl(instance.id),
        `${instance.name.replace(/[^a-z0-9-_]+/gi, "-")}-console.txt`,
      );
    } catch (downloadError) {
      pushMessage(downloadError instanceof Error ? downloadError.message : "Download failed");
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
            <ScrollArea
              ref={outputRef}
              variant="console"
              className={styles.output}
              onScroll={handleOutputScroll}
            >
              {!connected && (
                <p className={styles.systemLine}>Reconnecting to console…</p>
              )}
              {lines.length === 0 ? (
                <p className={styles.empty}>
                  {instance.status === "running"
                    ? "Waiting for output…"
                    : "No output yet. Start the instance to see logs here."}
                </p>
              ) : (
                lines.map((line, index) => (
                  <div
                    key={`${line.timestamp}-${index}`}
                    className={`${styles.line} ${line.stream === "stderr" ? styles.stderr : styles.stdout}`}
                  >
                    <span className={styles.timestamp}>
                      {new Date(line.timestamp).toLocaleTimeString()}
                    </span>
                    <span className={styles.text}>
                      <AnsiLine text={line.text} />
                    </span>
                  </div>
                ))
              )}
            </ScrollArea>
          </div>
        </div>

        <form className={styles.commandBar} onSubmit={sendInput}>
          <input
            type="text"
            className={styles.input}
            placeholder={inputPlaceholder}
            value={input}
            onChange={(event) => setInput(event.target.value)}
            disabled={inputDisabled}
            spellCheck={false}
            autoComplete="off"
          />
          <button
            type="submit"
            className={styles.submit}
            disabled={inputDisabled || !input.trim()}
          >
            Enter
          </button>
        </form>
      </div>

      <div className={cardStyles.cards}>
        <ActionCard
          title="Instance Settings"
          hint="Startup command, working directory, and instance deletion."
          actionLabel="Open Settings"
          onAction={onOpenSettings}
        />
        <ActionCard
          title="Instance Files"
          hint="Browse, upload, edit text files, and download."
          actionLabel="Open Files"
          onAction={onOpenFiles}
        />
        <ActionCard
          title="User Management"
          hint="Manage panel accounts and instance access."
          actionLabel="Open Users"
          onAction={onOpenUsers}
        />
        {javaRuntime && (
          <ActionCard
            title="Java Runtime"
            hint={javaRuntime.hint}
            actionLabel={javaRuntime.title}
            href={javaRuntime.url}
          />
        )}
      </div>
    </div>
  );
}
