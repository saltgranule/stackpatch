import net from "node:net";
import type { Socket } from "node:net";
import { randomUUID } from "node:crypto";
import type {
  DaemonGetLogsResult,
  DaemonGetStatusResult,
  DaemonLogEvent,
  DaemonStatusEvent,
  DaemonPingResult,
  DaemonRequest,
  DaemonResponse,
  DaemonSendInputResult,
  DaemonSubscribeLogsResult,
  DaemonSubscribeStatusResult,
  InstanceProcessConfig,
  LogLine,
} from "@stackpatch/shared";
import { daemonConfig } from "./config.js";
import type { ProcessManager } from "./process-manager.js";

function writeSocket(socket: Socket, data: string): boolean {
  if (!socket.writable) {
    return false;
  }

  try {
    socket.write(data);
    return true;
  } catch {
    return false;
  }
}

function endSocket(socket: Socket, data?: string): void {
  if (data !== undefined && !writeSocket(socket, data)) {
    return;
  }

  if (socket.destroyed) {
    return;
  }

  try {
    socket.end();
  } catch {
  }
}

export class IpcServer {
  private server: net.Server | null = null;

  constructor(private readonly processManager: ProcessManager) {}

  async start(port: number): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      this.server = net.createServer((socket) => {
        let buffer = "";

        socket.on("error", () => {
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

            void this.handleLine(socket, line);
          }
        });
      });

      this.server.listen(port, daemonConfig.ipcHost, () => resolve());
      this.server.on("error", reject);
    });
  }

  async stop(): Promise<void> {
    await new Promise<void>((resolve) => {
      if (!this.server) {
        resolve();
        return;
      }
      this.server.close(() => resolve());
      this.server = null;
    });
  }

  private async handleLine(socket: Socket, raw: string): Promise<void> {
    let request: DaemonRequest;

    try {
      request = JSON.parse(raw) as DaemonRequest;
    } catch {
      endSocket(
        socket,
        `${JSON.stringify({ id: randomUUID(), ok: false, error: "Invalid JSON request" })}\n`,
      );
      return;
    }

    if (request.method === "subscribeLogs") {
      this.handleSubscribeLogs(socket, request);
      return;
    }

    if (request.method === "subscribeStatus") {
      this.handleSubscribeStatus(socket, request);
      return;
    }

    try {
      const result = await this.dispatch(request);
      endSocket(socket, `${JSON.stringify({ id: request.id, ok: true, result })}\n`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Daemon request failed";
      endSocket(socket, `${JSON.stringify({ id: request.id, ok: false, error: message })}\n`);
    }
  }

  private handleSubscribeLogs(socket: Socket, request: DaemonRequest): void {
    const instanceId = request.params?.instanceId as string;
    if (!instanceId) {
      endSocket(
        socket,
        `${JSON.stringify({ id: request.id, ok: false, error: "instanceId is required" })}\n`,
      );
      return;
    }

    const lines = this.processManager.getLogs(instanceId);
    const response: DaemonResponse<DaemonSubscribeLogsResult> = {
      id: request.id,
      ok: true,
      result: { lines },
    };
    if (!writeSocket(socket, `${JSON.stringify(response)}\n`)) {
      return;
    }

    let unsubscribe = () => {};
    unsubscribe = this.processManager.subscribeLogs(instanceId, (line: LogLine) => {
      const event: DaemonLogEvent = { event: "log", line };
      if (!writeSocket(socket, `${JSON.stringify(event)}\n`)) {
        unsubscribe();
      }
    });

    socket.on("close", unsubscribe);
    socket.on("error", unsubscribe);
  }

  private handleSubscribeStatus(socket: Socket, request: DaemonRequest): void {
    const instances = this.processManager.getRuntimeStatus();
    const response: DaemonResponse<DaemonSubscribeStatusResult> = {
      id: request.id,
      ok: true,
      result: { instances },
    };
    if (!writeSocket(socket, `${JSON.stringify(response)}\n`)) {
      return;
    }

    let unsubscribe = () => {};
    unsubscribe = this.processManager.subscribeStatus((runtime) => {
      const event: DaemonStatusEvent = { event: "status", runtime };
      if (!writeSocket(socket, `${JSON.stringify(event)}\n`)) {
        unsubscribe();
      }
    });

    socket.on("close", unsubscribe);
    socket.on("error", unsubscribe);
  }

  private async dispatch(request: DaemonRequest): Promise<unknown> {
    switch (request.method) {
      case "ping":
        return {
          pid: process.pid,
          managedInstances: this.processManager.getRuntimeStatus().length,
        } satisfies DaemonPingResult;

      case "getStatus": {
        const instanceId = request.params?.instanceId as string | undefined;
        return {
          instances: this.processManager.getRuntimeStatus(instanceId),
        } satisfies DaemonGetStatusResult;
      }

      case "getLogs": {
        const instanceId = request.params?.instanceId as string;
        if (!instanceId) {
          throw new Error("instanceId is required");
        }
        const lineCount = request.params?.lines as number | undefined;
        return {
          lines: this.processManager.getLogs(instanceId, lineCount),
        } satisfies DaemonGetLogsResult;
      }

      case "sendInput": {
        const instanceId = request.params?.instanceId as string;
        const text = request.params?.text as string;
        const config = request.params?.config as InstanceProcessConfig;
        if (!instanceId || !text || !config) {
          throw new Error("instanceId, text, and config are required");
        }
        const result = this.processManager.sendConsoleInput(instanceId, text, config);
        if (!result.sent) {
          throw new Error(result.error ?? "Failed to send input");
        }
        return { sent: true, mode: result.mode } satisfies DaemonSendInputResult;
      }

      case "appendLog": {
        const instanceId = request.params?.instanceId as string;
        const text = request.params?.text as string;
        const stream = request.params?.stream as LogLine["stream"] | undefined;
        if (!instanceId || !text) {
          throw new Error("instanceId and text are required");
        }
        const lines = this.processManager.appendSystemLog(
          instanceId,
          text,
          stream ?? "stderr",
        );
        const line = lines[0];
        if (!line) {
          throw new Error("Failed to append console log");
        }
        return { line };
      }

      case "start": {
        const instanceId = request.params?.instanceId as string;
        const config = request.params?.config as InstanceProcessConfig;
        if (!instanceId || !config) {
          throw new Error("instanceId and config are required");
        }
        return this.processManager.start(instanceId, config);
      }

      case "stop": {
        const instanceId = request.params?.instanceId as string;
        if (!instanceId) {
          throw new Error("instanceId is required");
        }
        return this.processManager.stop(instanceId);
      }

      case "terminate": {
        const instanceId = request.params?.instanceId as string;
        if (!instanceId) {
          throw new Error("instanceId is required");
        }
        return this.processManager.terminate(instanceId);
      }

      case "restart": {
        const instanceId = request.params?.instanceId as string;
        const config = request.params?.config as InstanceProcessConfig;
        if (!instanceId || !config) {
          throw new Error("instanceId and config are required");
        }
        return this.processManager.restart(instanceId, config);
      }

      default:
        throw new Error(`Unknown method: ${request.method as string}`);
    }
  }
}
