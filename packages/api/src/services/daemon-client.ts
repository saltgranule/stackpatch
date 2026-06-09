import net from "node:net";
import { randomUUID } from "node:crypto";
import type {
  DaemonAppendLogResult,
  DaemonGetLogsResult,
  DaemonGetStatusResult,
  DaemonLogEvent,
  DaemonMethod,
  DaemonPingResult,
  DaemonResponse,
  DaemonSendInputResult,
  DaemonStatusEvent,
  DaemonSubscribeLogsResult,
  DaemonSubscribeStatusResult,
  InstanceProcessConfig,
  InstanceRuntimeStatus,
  LogLine,
} from "@stackpatch/shared";
import { getMaxStopRequestTimeoutMs } from "@stackpatch/shared";
import { config } from "../config.js";
import { getActiveDaemonPort } from "../runtime-config.js";

class DaemonUnavailableError extends Error {
  constructor(message = "Daemon is not available") {
    super(message);
    this.name = "DaemonUnavailableError";
  }
}

const DEFAULT_REQUEST_TIMEOUT_MS = 10_000;
const LONG_REQUEST_TIMEOUT_MS = 25_000;
const STOP_REQUEST_TIMEOUT_MS = 10_000;
const RESTART_REQUEST_TIMEOUT_MS = getMaxStopRequestTimeoutMs();

function getRequestTimeout(method: DaemonMethod): number {
  if (method === "stop" || method === "terminate") {
    return STOP_REQUEST_TIMEOUT_MS;
  }
  if (method === "restart") {
    return RESTART_REQUEST_TIMEOUT_MS;
  }
  if (method === "start") {
    return LONG_REQUEST_TIMEOUT_MS;
  }
  return DEFAULT_REQUEST_TIMEOUT_MS;
}

export class DaemonClient {
  private async request<T>(
    method: DaemonMethod,
    params?: Record<string, unknown>,
    timeoutMs = getRequestTimeout(method),
  ): Promise<T> {
    const requestId = randomUUID();
    const payload = JSON.stringify({ id: requestId, method, params });

    return new Promise((resolve, reject) => {
      const socket = net.createConnection(
        { host: config.daemonIpcHost, port: getActiveDaemonPort() },
        () => {
          socket.write(`${payload}\n`);
        },
      );

      let buffer = "";

      socket.on("data", (chunk) => {
        buffer += chunk.toString();
        const newlineIndex = buffer.indexOf("\n");
        if (newlineIndex === -1) {
          return;
        }

        socket.end();
        const line = buffer.slice(0, newlineIndex).trim();

        try {
          const response = JSON.parse(line) as DaemonResponse<T>;
          if (!response.ok) {
            reject(new DaemonUnavailableError(response.error ?? "Daemon request failed"));
            return;
          }
          resolve(response.result as T);
        } catch (error) {
          reject(error);
        }
      });

      socket.on("error", () => {
        reject(new DaemonUnavailableError());
      });

      socket.setTimeout(timeoutMs, () => {
        socket.destroy();
        reject(new DaemonUnavailableError("Daemon request timed out"));
      });
    });
  }

  subscribeLogs(
    instanceId: string,
    handlers: {
      onHistory: (lines: LogLine[]) => void;
      onLine: (line: LogLine) => void;
      onError?: (error: Error) => void;
    },
  ): () => void {
    const requestId = randomUUID();
    const socket = net.createConnection({
      host: config.daemonIpcHost,
      port: getActiveDaemonPort(),
    });

    let buffer = "";
    let historyDelivered = false;
    // Guard: ensures onError fires at most once regardless of which socket
    // event triggers it (error vs close). Without this, a graceful shutdown
    // emits close without error, leaving the subscription silently frozen.
    let errorFired = false;

    const fireError = (err: Error) => {
      if (errorFired) return;
      errorFired = true;
      handlers.onError?.(err);
    };

    socket.on("connect", () => {
      socket.write(
        `${JSON.stringify({ id: requestId, method: "subscribeLogs", params: { instanceId } })}\n`,
      );
    });

    socket.on("data", (chunk) => {
      buffer += chunk.toString();

      while (true) {
        const newlineIndex = buffer.indexOf("\n");
        if (newlineIndex === -1) {
          break;
        }

        const line = buffer.slice(0, newlineIndex).trim();
        buffer = buffer.slice(newlineIndex + 1);
        if (!line) {
          continue;
        }

        const parsed = JSON.parse(line) as DaemonResponse<DaemonSubscribeLogsResult> | DaemonLogEvent;

        if ("event" in parsed && parsed.event === "log") {
          handlers.onLine(parsed.line);
          continue;
        }

        if (!historyDelivered && "ok" in parsed) {
          if (!parsed.ok) {
            fireError(new DaemonUnavailableError(parsed.error ?? "Subscribe failed"));
            socket.destroy();
            return;
          }
          historyDelivered = true;
          handlers.onHistory(parsed.result?.lines ?? []);
        }
      }
    });

    socket.on("error", (error) => {
      fireError(error);
    });

    // Handles graceful daemon shutdown (FIN packet): Node emits 'close' with
    // hadError=false, never 'error'. Without this handler the subscription
    // stays open and the browser console appears live while logs are frozen.
    socket.on("close", () => {
      fireError(new DaemonUnavailableError("Daemon connection closed"));
    });

    return () => socket.destroy();
  }

  subscribeStatus(handlers: {
    onSnapshot: (instances: InstanceRuntimeStatus[]) => void;
    onUpdate: (runtime: InstanceRuntimeStatus) => void;
    onError?: (error: Error) => void;
  }): () => void {
    const requestId = randomUUID();
    const socket = net.createConnection({
      host: config.daemonIpcHost,
      port: getActiveDaemonPort(),
    });

    let buffer = "";
    let snapshotDelivered = false;
    let errorFired = false;

    const fireError = (err: Error) => {
      if (errorFired) return;
      errorFired = true;
      handlers.onError?.(err);
    };

    socket.on("connect", () => {
      socket.write(
        `${JSON.stringify({ id: requestId, method: "subscribeStatus", params: {} })}\n`,
      );
    });

    socket.on("data", (chunk) => {
      buffer += chunk.toString();

      while (true) {
        const newlineIndex = buffer.indexOf("\n");
        if (newlineIndex === -1) {
          break;
        }

        const line = buffer.slice(0, newlineIndex).trim();
        buffer = buffer.slice(newlineIndex + 1);
        if (!line) {
          continue;
        }

        const parsed = JSON.parse(line) as
          | DaemonResponse<DaemonSubscribeStatusResult>
          | DaemonStatusEvent;

        if ("event" in parsed && parsed.event === "status") {
          handlers.onUpdate(parsed.runtime);
          continue;
        }

        if (!snapshotDelivered && "ok" in parsed) {
          if (!parsed.ok) {
            fireError(new DaemonUnavailableError(parsed.error ?? "Subscribe failed"));
            socket.destroy();
            return;
          }
          snapshotDelivered = true;
          handlers.onSnapshot(parsed.result?.instances ?? []);
        }
      }
    });

    socket.on("error", (error) => {
      fireError(error);
    });

    socket.on("close", () => {
      fireError(new DaemonUnavailableError("Daemon connection closed"));
    });

    return () => socket.destroy();
  }

  async ping(): Promise<DaemonPingResult> {
    return this.request<DaemonPingResult>("ping");
  }

  async getStatus(instanceId?: string): Promise<InstanceRuntimeStatus[]> {
    const result = await this.request<DaemonGetStatusResult>("getStatus", { instanceId });
    return result.instances;
  }

  async getLogs(instanceId: string, lines?: number) {
    const result = await this.request<DaemonGetLogsResult>("getLogs", { instanceId, lines });
    return result.lines;
  }

  async appendLog(
    instanceId: string,
    text: string,
    stream: LogLine["stream"] = "stderr",
  ): Promise<LogLine> {
    const result = await this.request<DaemonAppendLogResult>("appendLog", {
      instanceId,
      text,
      stream,
    });
    return result.line;
  }

  async sendInput(
    instanceId: string,
    text: string,
    config: InstanceProcessConfig,
  ) {
    return this.request<DaemonSendInputResult>("sendInput", { instanceId, text, config });
  }

  async start(instanceId: string, processConfig: InstanceProcessConfig) {
    return this.request<InstanceRuntimeStatus>("start", { instanceId, config: processConfig });
  }

  async stop(instanceId: string) {
    return this.request<InstanceRuntimeStatus>("stop", { instanceId });
  }

  async terminate(instanceId: string) {
    return this.request<InstanceRuntimeStatus>("terminate", { instanceId });
  }

  async restart(instanceId: string, processConfig: InstanceProcessConfig) {
    return this.request<InstanceRuntimeStatus>("restart", {
      instanceId,
      config: processConfig,
    });
  }
}

let client: DaemonClient | null = null;

export function getDaemonClient(): DaemonClient {
  if (!client) {
    client = new DaemonClient();
  }
  return client;
}

export function isDaemonError(error: unknown): error is DaemonUnavailableError {
  return error instanceof DaemonUnavailableError;
}