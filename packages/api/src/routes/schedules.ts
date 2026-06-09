import type { FastifyInstance, FastifyReply } from "fastify";
import type { ScheduleAction, ScheduleIntervalUnit } from "@stackpatch/shared";
import {
  isScheduleAction,
  isScheduleIntervalUnit,
  isValidScheduleInterval,
} from "@stackpatch/shared";
import { getRequestUser, requireInstanceAccess } from "../auth/middleware.js";
import {
  createSchedule,
  deleteSchedule,
  getScheduleById,
  listSchedulesForInstance,
  updateSchedule,
} from "../db/instance-schedules.js";
import { getInstanceById } from "../db/instances.js";
import { recordAuditEvent } from "../services/audit-log.js";

interface CreateScheduleBody {
  action: ScheduleAction;
  intervalValue: number;
  intervalUnit: ScheduleIntervalUnit;
  enabled?: boolean;
  command?: string;
}

interface UpdateScheduleBody {
  action?: ScheduleAction;
  intervalValue?: number;
  intervalUnit?: ScheduleIntervalUnit;
  enabled?: boolean;
  command?: string;
}

function validateScheduleBody(
  body: CreateScheduleBody | UpdateScheduleBody,
  reply: FastifyReply,
  requireAction = false,
): boolean {
  if (requireAction) {
    const createBody = body as CreateScheduleBody;
    if (!createBody.action || !isScheduleAction(createBody.action)) {
      void reply.status(400).send({ error: "A valid schedule action is required" });
      return false;
    }
  } else if (body.action !== undefined && !isScheduleAction(body.action)) {
    void reply.status(400).send({ error: "Invalid schedule action" });
    return false;
  }

  if (requireAction) {
    const createBody = body as CreateScheduleBody;
    if (!createBody.intervalUnit || !isScheduleIntervalUnit(createBody.intervalUnit)) {
      void reply.status(400).send({ error: "Invalid schedule interval unit" });
      return false;
    }

    if (!isValidScheduleInterval(createBody.intervalValue, createBody.intervalUnit)) {
      void reply.status(400).send({ error: "Invalid schedule interval" });
      return false;
    }
  } else if (body.intervalUnit !== undefined && !isScheduleIntervalUnit(body.intervalUnit)) {
    void reply.status(400).send({ error: "Invalid schedule interval unit" });
    return false;
  }

  const action = (body as CreateScheduleBody).action;
  const command = body.command?.trim();
  if (action === "run_command" && !command) {
    void reply.status(400).send({ error: "Command is required for run_command schedules" });
    return false;
  }

  return true;
}

export async function scheduleRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Params: { id: string } }>(
    "/api/instances/:id/schedules",
    async (request, reply) => {
      await requireInstanceAccess(request, reply, request.params.id, "viewer");
      if (reply.sent) return;

      const instance = getInstanceById(request.params.id);
      if (!instance) {
        return reply.status(404).send({ error: "Instance not found" });
      }

      return { schedules: listSchedulesForInstance(instance.id) };
    },
  );

  app.post<{ Params: { id: string }; Body: CreateScheduleBody }>(
    "/api/instances/:id/schedules",
    async (request, reply) => {
      await requireInstanceAccess(request, reply, request.params.id, "admin");
      if (reply.sent) return;

      const instance = getInstanceById(request.params.id);
      if (!instance) {
        return reply.status(404).send({ error: "Instance not found" });
      }

      if (!validateScheduleBody(request.body, reply, true)) {
        return;
      }

      const user = getRequestUser(request);
      const schedule = createSchedule({
        instanceId: instance.id,
        action: request.body.action,
        intervalValue: request.body.intervalValue,
        intervalUnit: request.body.intervalUnit,
        enabled: request.body.enabled,
        command: request.body.command ?? null,
      });

      recordAuditEvent(
        user,
        "schedule.create",
        `${user.username} created ${schedule.action} schedule for "${instance.name}"`,
        instance,
      );

      return reply.status(201).send({ schedule });
    },
  );

  app.patch<{ Params: { id: string; scheduleId: string }; Body: UpdateScheduleBody }>(
    "/api/instances/:id/schedules/:scheduleId",
    async (request, reply) => {
      await requireInstanceAccess(request, reply, request.params.id, "admin");
      if (reply.sent) return;

      const instance = getInstanceById(request.params.id);
      if (!instance) {
        return reply.status(404).send({ error: "Instance not found" });
      }

      const existing = getScheduleById(instance.id, request.params.scheduleId);
      if (!existing) {
        return reply.status(404).send({ error: "Schedule not found" });
      }

      const nextAction = request.body.action ?? existing.action;
      const nextUnit = request.body.intervalUnit ?? existing.intervalUnit;
      const nextValue = request.body.intervalValue ?? existing.intervalValue;
      const nextCommand =
        request.body.command === undefined ? existing.command : request.body.command.trim() || null;

      if (nextAction === "run_command" && !nextCommand) {
        return reply.status(400).send({ error: "Command is required for run_command schedules" });
      }

      if (!isValidScheduleInterval(nextValue, nextUnit)) {
        return reply.status(400).send({ error: "Invalid schedule interval" });
      }

      if (!validateScheduleBody({ ...request.body, action: nextAction }, reply)) {
        return;
      }

      const user = getRequestUser(request);
      const schedule = updateSchedule(instance.id, existing.id, {
        ...request.body,
        command: nextCommand,
      });

      recordAuditEvent(
        user,
        "schedule.update",
        `${user.username} updated ${schedule?.action ?? existing.action} schedule for "${instance.name}"`,
        instance,
      );

      return { schedule };
    },
  );

  app.delete<{ Params: { id: string; scheduleId: string } }>(
    "/api/instances/:id/schedules/:scheduleId",
    async (request, reply) => {
      await requireInstanceAccess(request, reply, request.params.id, "admin");
      if (reply.sent) return;

      const instance = getInstanceById(request.params.id);
      if (!instance) {
        return reply.status(404).send({ error: "Instance not found" });
      }

      const existing = getScheduleById(instance.id, request.params.scheduleId);
      if (!existing) {
        return reply.status(404).send({ error: "Schedule not found" });
      }

      deleteSchedule(instance.id, existing.id);

      const user = getRequestUser(request);
      recordAuditEvent(
        user,
        "schedule.delete",
        `${user.username} deleted ${existing.action} schedule for "${instance.name}"`,
        instance,
      );

      return { ok: true };
    },
  );
}
