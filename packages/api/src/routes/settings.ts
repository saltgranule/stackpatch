import type { FastifyInstance } from "fastify";
import { getRequestUser, requireAdmin } from "../auth/middleware.js";
import { updateSystemSettings } from "../db/settings.js";
import { getSystemSettingsStatus } from "../runtime-config.js";
import { recordAuditEvent } from "../services/audit-log.js";

interface UpdateSettingsBody {
  panelPort?: number;
  daemonPort?: number;
}

export async function settingsRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/settings", async (request, reply) => {
    getRequestUser(request);
    await requireAdmin(request, reply);
    if (reply.sent) return;

    return getSystemSettingsStatus();
  });

  app.patch<{ Body: UpdateSettingsBody }>("/api/settings", async (request, reply) => {
    getRequestUser(request);
    await requireAdmin(request, reply);
    if (reply.sent) return;

    try {
      updateSystemSettings(request.body ?? {});
      const user = getRequestUser(request);
      recordAuditEvent(user, "settings.update", `${user.username} updated system settings`);
      return getSystemSettingsStatus();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to update settings";
      return reply.status(400).send({ error: message });
    }
  });
}
