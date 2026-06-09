import type { FastifyInstance, FastifyReply } from "fastify";
import { v4 as uuid } from "uuid";
import {
  getApplicationTypeDefinition,
  isApplicationType,
  type ApplicationType,
} from "@stackpatch/shared";
import { getRequestUser, requireInstanceAccess } from "../auth/middleware.js";
import {
  createInstance,
  deleteInstance,
  getInstanceById,
  toProcessConfig,
  updateInstance,
  updateInstanceRuntime,
} from "../db/instances.js";
import { listInstancesForUser } from "../lib/instance-access.js";
import {
  isPathSecurityError,
  prepareWorkingDirectory,
} from "../lib/instance-paths.js";
import { resolveStartupCommand } from "../lib/startup.js";
import { getDaemonClient, isDaemonError } from "../services/daemon-client.js";
import { isDaemonConnected } from "../services/daemon.js";
import { logToInstanceConsole } from "../services/instance-console-log.js";
import { recordAuditEvent, summarizeInstanceUpdate } from "../services/audit-log.js";
import { syncAllInstances, syncInstance } from "../services/instance-sync.js";

interface CreateInstanceBody {
  name: string;
  applicationType?: ApplicationType;
  startupCommand: string;
  workingDirectory?: string;
  autoRestart?: boolean;
  maxRestartRetries?: number;
  stopCommand?: string;
}

interface UpdateInstanceBody {
  name?: string;
  applicationType?: ApplicationType;
  startupCommand?: string;
  workingDirectory?: string;
  autoRestart?: boolean;
  maxRestartRetries?: number;
  stopCommand?: string;
}

function parseApplicationType(value: string | undefined): ApplicationType | null {
  if (!value) {
    return null;
  }
  return isApplicationType(value) ? value : null;
}

function daemonRequired(reply: FastifyReply) {
  if (!isDaemonConnected()) {
    void reply.status(503).send({ error: "Daemon is not connected" });
    return false;
  }
  return true;
}

async function respondDaemonError(
  instanceId: string,
  reply: FastifyReply,
  error: unknown,
): Promise<boolean> {
  if (isDaemonError(error)) {
    await logToInstanceConsole(instanceId, error.message);
    void reply.status(503).send({ error: error.message });
    return true;
  }
  return false;
}

export async function instanceRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/instances", async (request) => {
    const user = getRequestUser(request);
    return { instances: listInstancesForUser(user) };
  });

  app.get("/api/instances/sync", async (request) => {
    const user = getRequestUser(request);
    await syncAllInstances();
    return { instances: listInstancesForUser(user) };
  });

  app.get<{ Params: { id: string } }>("/api/instances/:id", async (request, reply) => {
    await requireInstanceAccess(request, reply, request.params.id, "viewer");
    if (reply.sent) return;

    const instance = await syncInstance(request.params.id);
    if (!instance) {
      return reply.status(404).send({ error: "Instance not found" });
    }
    return { instance };
  });

  app.post<{ Body: CreateInstanceBody }>("/api/instances", async (request, reply) => {
    const user = getRequestUser(request);
    if (user.role !== "admin") {
      return reply.status(403).send({ error: "Admin access required" });
    }

    const { name, startupCommand, workingDirectory, applicationType } = request.body;

    if (!name?.trim() || !startupCommand?.trim()) {
      return reply.status(400).send({
        error: "name and startupCommand are required",
      });
    }

    const parsedApplicationType = parseApplicationType(applicationType);
    if (applicationType && !parsedApplicationType) {
      return reply.status(400).send({ error: "Invalid applicationType" });
    }

    try {
      const id = uuid();
      const resolvedWorkingDirectory = prepareWorkingDirectory(
        id,
        name.trim(),
        workingDirectory,
      );
      const resolved = resolveStartupCommand(
        startupCommand.trim(),
        resolvedWorkingDirectory,
      );
      const resolvedType = parsedApplicationType ?? "minecraft";

      const instance = createInstance(id, {
        ...request.body,
        name: name.trim(),
        applicationType: resolvedType,
        executablePath: resolved.executablePath,
        arguments: resolved.arguments,
        workingDirectory: resolvedWorkingDirectory,
        stopCommand:
          request.body.stopCommand?.trim() ??
          getApplicationTypeDefinition(resolvedType).defaultStopCommand,
      });
      recordAuditEvent(
        user,
        "instance.create",
        `${user.username} created instance "${instance.name}"`,
        instance,
      );
      return reply.status(201).send({ instance });
    } catch (error) {
      if (isPathSecurityError(error)) {
        return reply.status(400).send({ error: error.message });
      }
      throw error;
    }
  });

  app.post<{ Params: { id: string }; Body: { name?: string } }>(
    "/api/instances/:id/clone",
    async (request, reply) => {
      const user = getRequestUser(request);
      if (user.role !== "admin") {
        return reply.status(403).send({ error: "Admin access required" });
      }

      await requireInstanceAccess(request, reply, request.params.id, "viewer");
      if (reply.sent) return;

      const source = getInstanceById(request.params.id);
      if (!source) {
        return reply.status(404).send({ error: "Instance not found" });
      }

      const name = request.body.name?.trim() || `${source.name} copy`;
      if (!name) {
        return reply.status(400).send({ error: "A name is required to clone an instance" });
      }

      try {
        const id = uuid();
        const workingDirectory = prepareWorkingDirectory(id, name);

        const instance = createInstance(id, {
          name,
          applicationType: source.applicationType,
          executablePath: source.executablePath,
          arguments: source.arguments,
          workingDirectory,
          memoryLimitMb: source.memoryLimitMb,
          autoRestart: source.autoRestart,
          maxRestartRetries: source.maxRestartRetries,
          stopCommand: source.stopCommand,
        });

        recordAuditEvent(
          user,
          "instance.create",
          `${user.username} cloned instance "${source.name}" as "${instance.name}"`,
          instance,
        );

        return reply.status(201).send({ instance });
      } catch (error) {
        if (isPathSecurityError(error)) {
          return reply.status(400).send({ error: error.message });
        }
        throw error;
      }
    },
  );

  app.patch<{ Params: { id: string }; Body: UpdateInstanceBody }>(
    "/api/instances/:id",
    async (request, reply) => {
      await requireInstanceAccess(request, reply, request.params.id, "admin");
      if (reply.sent) return;

      const user = getRequestUser(request);
      const existing = getInstanceById(request.params.id);
      if (!existing) {
        return reply.status(404).send({ error: "Instance not found" });
      }

      try {
        let executablePath = existing.executablePath;
        let args = existing.arguments;
        let workingDirectory = existing.workingDirectory;
        const parsedApplicationType = parseApplicationType(request.body.applicationType);
        if (request.body.applicationType && !parsedApplicationType) {
          return reply.status(400).send({ error: "Invalid applicationType" });
        }

        if (request.body.workingDirectory?.trim()) {
          workingDirectory = prepareWorkingDirectory(
            existing.id,
            request.body.name?.trim() ?? existing.name,
            request.body.workingDirectory,
          );
        }

        if (request.body.startupCommand?.trim()) {
          const resolved = resolveStartupCommand(
            request.body.startupCommand.trim(),
            workingDirectory,
          );
          executablePath = resolved.executablePath;
          args = resolved.arguments;
        }

        const updated = updateInstance(existing.id, {
          name: request.body.name?.trim(),
          applicationType: parsedApplicationType ?? undefined,
          executablePath,
          arguments: args,
          workingDirectory,
          autoRestart: request.body.autoRestart,
          maxRestartRetries: request.body.maxRestartRetries,
          stopCommand: request.body.stopCommand,
        });

        if (updated) {
          const summary = summarizeInstanceUpdate(existing, request.body);
          recordAuditEvent(
            user,
            "instance.update",
            `${user.username} modified instance "${updated.name}" (${summary})`,
            updated,
          );
        }

        return { instance: updated };
      } catch (error) {
        if (isPathSecurityError(error)) {
          return reply.status(400).send({ error: error.message });
        }
        throw error;
      }
    },
  );

  app.post<{ Params: { id: string } }>(
    "/api/instances/:id/start",
    async (request, reply) => {
      await requireInstanceAccess(request, reply, request.params.id, "admin");
      if (reply.sent) return;
      if (!daemonRequired(reply)) return;

      const user = getRequestUser(request);
      const instance = getInstanceById(request.params.id);
      if (!instance) {
        return reply.status(404).send({ error: "Instance not found" });
      }

      try {
        const runtime = await getDaemonClient().start(
          instance.id,
          toProcessConfig(instance),
        );
        const updated = updateInstanceRuntime(
          instance.id,
          runtime.status,
          runtime.pid,
          runtime.startedAt,
        );
        recordAuditEvent(
          user,
          "instance.start",
          `${user.username} started instance "${instance.name}"`,
          instance,
        );
        return { instance: updated };
      } catch (error) {
        if (await respondDaemonError(instance.id, reply, error)) return;
        throw error;
      }
    },
  );

  app.post<{ Params: { id: string } }>(
    "/api/instances/:id/stop",
    async (request, reply) => {
      await requireInstanceAccess(request, reply, request.params.id, "admin");
      if (reply.sent) return;
      if (!daemonRequired(reply)) return;

      const user = getRequestUser(request);
      const instance = getInstanceById(request.params.id);
      if (!instance) {
        return reply.status(404).send({ error: "Instance not found" });
      }

      try {
        const runtime = await getDaemonClient().stop(instance.id);
        const updated = updateInstanceRuntime(
          instance.id,
          runtime.status,
          runtime.pid,
          runtime.startedAt,
        );
        recordAuditEvent(
          user,
          "instance.stop",
          `${user.username} stopped instance "${instance.name}"`,
          instance,
        );
        return { instance: updated };
      } catch (error) {
        if (await respondDaemonError(instance.id, reply, error)) return;
        throw error;
      }
    },
  );

  app.post<{ Params: { id: string } }>(
    "/api/instances/:id/terminate",
    async (request, reply) => {
      await requireInstanceAccess(request, reply, request.params.id, "admin");
      if (reply.sent) return;
      if (!daemonRequired(reply)) return;

      const user = getRequestUser(request);
      const instance = getInstanceById(request.params.id);
      if (!instance) {
        return reply.status(404).send({ error: "Instance not found" });
      }

      try {
        const runtime = await getDaemonClient().terminate(instance.id);
        const updated = updateInstanceRuntime(
          instance.id,
          runtime.status,
          runtime.pid,
          runtime.startedAt,
        );
        recordAuditEvent(
          user,
          "instance.terminate",
          `${user.username} terminated instance "${instance.name}"`,
          instance,
        );
        return { instance: updated };
      } catch (error) {
        if (await respondDaemonError(instance.id, reply, error)) return;
        throw error;
      }
    },
  );

  app.post<{ Params: { id: string } }>(
    "/api/instances/:id/restart",
    async (request, reply) => {
      await requireInstanceAccess(request, reply, request.params.id, "admin");
      if (reply.sent) return;
      if (!daemonRequired(reply)) return;

      const user = getRequestUser(request);
      const instance = getInstanceById(request.params.id);
      if (!instance) {
        return reply.status(404).send({ error: "Instance not found" });
      }

      try {
        const runtime = await getDaemonClient().restart(
          instance.id,
          toProcessConfig(instance),
        );
        const updated = updateInstanceRuntime(
          instance.id,
          runtime.status,
          runtime.pid,
          runtime.startedAt,
        );
        recordAuditEvent(
          user,
          "instance.restart",
          `${user.username} restarted instance "${instance.name}"`,
          instance,
        );
        return { instance: updated };
      } catch (error) {
        if (await respondDaemonError(instance.id, reply, error)) return;
        throw error;
      }
    },
  );

  app.delete<{ Params: { id: string } }>("/api/instances/:id", async (request, reply) => {
    const user = getRequestUser(request);
    if (user.role !== "admin") {
      return reply.status(403).send({ error: "Admin access required" });
    }

    const instance = getInstanceById(request.params.id);
    if (!instance) {
      return reply.status(404).send({ error: "Instance not found" });
    }

    if (isDaemonConnected()) {
      try {
        if (instance.status === "running" || instance.status === "starting") {
          await getDaemonClient().stop(instance.id);
        }
      } catch (error) {
        if (await respondDaemonError(instance.id, reply, error)) return;
        throw error;
      }
    }

    const removed = deleteInstance(instance.id);
    if (!removed) {
      return reply.status(404).send({ error: "Instance not found" });
    }

    recordAuditEvent(
      user,
      "instance.delete",
      `${user.username} deleted instance "${instance.name}"`,
      instance,
    );

    return { ok: true };
  });

  app.get<{ Params: { id: string }; Querystring: { lines?: string } }>(
    "/api/instances/:id/logs",
    async (request, reply) => {
      await requireInstanceAccess(request, reply, request.params.id, "viewer");
      if (reply.sent) return;
      if (!daemonRequired(reply)) return;

      const instance = getInstanceById(request.params.id);
      if (!instance) {
        return reply.status(404).send({ error: "Instance not found" });
      }

      const lines = request.query.lines ? Number(request.query.lines) : undefined;

      try {
        const logLines = await getDaemonClient().getLogs(instance.id, lines);
        return { lines: logLines };
      } catch (error) {
        if (await respondDaemonError(instance.id, reply, error)) return;
        throw error;
      }
    },
  );

}
