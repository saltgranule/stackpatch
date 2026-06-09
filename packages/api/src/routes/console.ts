import type { FastifyInstance } from "fastify";
import websocket from "@fastify/websocket";
import { createConsoleSystemLine } from "@stackpatch/shared";
import { canAccessInstance } from "../auth/permissions.js";
import { getRequestUser } from "../auth/middleware.js";
import { getInstanceById, toProcessConfig } from "../db/instances.js";
import { reportConsoleError, sendConsoleLine } from "../lib/console-ws.js";
import { RateLimiter } from "../lib/rate-limiter.js";
import { getDaemonClient, isDaemonError } from "../services/daemon-client.js";
import { isDaemonConnected } from "../services/daemon.js";
import { logToInstanceConsole } from "../services/instance-console-log.js";

interface ConsoleClientMessage {
  type: "input";
  text: string;
}

interface ConsoleLogBody {
  message: string;
}

export async function consoleRoutes(app: FastifyInstance): Promise<void> {
  await app.register(websocket);

  app.post<{ Params: { id: string }; Body: ConsoleLogBody }>(
    "/api/instances/:id/console/log",
    async (request, reply) => {
      const user = getRequestUser(request);
      if (!canAccessInstance(user, request.params.id, "viewer")) {
        return reply.status(403).send({ error: "Insufficient permissions" });
      }

      const instance = getInstanceById(request.params.id);
      if (!instance) {
        return reply.status(404).send({ error: "Instance not found" });
      }

      const message = request.body?.message?.trim();
      if (!message) {
        return reply.status(400).send({ error: "message is required" });
      }

      const line = await logToInstanceConsole(instance.id, message);
      if (!line) {
        return reply.status(503).send({ error: "Daemon is not connected" });
      }

      return { line };
    },
  );

  app.get<{ Params: { id: string } }>(
    "/api/instances/:id/console/ws",
    { websocket: true },
    (socket, request) => {
      let user;
      try {
        user = getRequestUser(request);
      } catch {
        sendConsoleLine(socket, createConsoleSystemLine("Authentication required"));
        socket.close(1008, "Authentication required");
        return;
      }

      const instanceId = request.params.id;
      const instance = getInstanceById(instanceId);

      if (!instance) {
        sendConsoleLine(socket, createConsoleSystemLine("Instance not found"));
        socket.close(1008, "Instance not found");
        return;
      }

      if (!canAccessInstance(user, instanceId, "viewer")) {
        sendConsoleLine(socket, createConsoleSystemLine("Insufficient permissions"));
        socket.close(1008, "Insufficient permissions");
        return;
      }

      if (!isDaemonConnected()) {
        sendConsoleLine(socket, createConsoleSystemLine("Daemon disconnected"));
        socket.close(1011, "Daemon disconnected");
        return;
      }

      const canSendInput = canAccessInstance(user, instanceId, "admin");
      const inputLimiter = new RateLimiter(10, 1000);
      let unsubscribe: (() => void) | null = null;

      try {
        unsubscribe = getDaemonClient().subscribeLogs(instanceId, {
          onHistory: (lines) => {
            if (socket.readyState === socket.OPEN) {
              socket.send(JSON.stringify({ type: "history", lines }));
            }
          },
          onLine: (line) => {
            sendConsoleLine(socket, line);
          },
          onError: (error) => {
            void reportConsoleError(instanceId, socket, error.message).finally(() => {
              socket.close(1011, "Log stream error");
            });
          },
        });
      } catch {
        void reportConsoleError(instanceId, socket, "Failed to subscribe to logs").finally(() => {
          socket.close(1011, "Failed to subscribe to logs");
        });
        return;
      }

      socket.on("message", (raw: Buffer | ArrayBuffer | Buffer[]) => {
        if (!canSendInput) {
          void reportConsoleError(instanceId, socket, "Read-only access");
          return;
        }

        try {
          const message = JSON.parse(raw.toString()) as ConsoleClientMessage;
          if (message.type !== "input") {
            void reportConsoleError(instanceId, socket, "Unsupported message type");
            return;
          }

          if (!message.text?.trim()) {
            void reportConsoleError(instanceId, socket, "Command cannot be empty");
            return;
          }

          if (!inputLimiter.tryConsume()) {
            void reportConsoleError(instanceId, socket, "Input rate limit exceeded");
            return;
          }

          void getDaemonClient()
            .sendInput(instanceId, message.text, toProcessConfig(instance))
            .then(() => {
              if (socket.readyState === socket.OPEN) {
                socket.send(JSON.stringify({ type: "input", sent: true }));
              }
            })
            .catch((error) => {
              const text = isDaemonError(error) ? error.message : "Failed to send input";
              void reportConsoleError(instanceId, socket, text);
            });
        } catch {
          void reportConsoleError(instanceId, socket, "Invalid message");
        }
      });

      socket.on("close", () => {
        unsubscribe?.();
      });
    },
  );

  app.get<{ Params: { id: string } }>(
    "/api/instances/:id/logs/download",
    async (request, reply) => {
      const user = getRequestUser(request);
      const instance = getInstanceById(request.params.id);

      if (!instance) {
        return reply.status(404).send({ error: "Instance not found" });
      }

      if (!canAccessInstance(user, instance.id, "viewer")) {
        return reply.status(403).send({ error: "Insufficient permissions" });
      }

      if (!isDaemonConnected()) {
        return reply.status(503).send({ error: "Daemon is not connected" });
      }

      try {
        const lines = await getDaemonClient().getLogs(instance.id);
        const body = formatLogDownload(lines);

        return reply
          .header("Content-Type", "text/plain; charset=utf-8")
          .header(
            "Content-Disposition",
            `attachment; filename="${instance.name.replace(/[^a-z0-9-_]+/gi, "-")}-console.txt"`,
          )
          .send(body);
      } catch (error) {
        if (isDaemonError(error)) {
          return reply.status(503).send({ error: error.message });
        }
        throw error;
      }
    },
  );
}

function formatLogDownload(lines: import("@stackpatch/shared").LogLine[]): string {
  return lines
    .map((line) => `[${line.timestamp}] [${line.stream}] ${line.text}`)
    .join("\n");
}
