import type { FastifyInstance } from "fastify";
import { AUDIT_LOG_LIMIT, type AuditLogEntry } from "@stackpatch/shared";
import { getRequestUser, requireAdmin } from "../auth/middleware.js";
import { listAuditLogs } from "../db/audit-logs.js";

function formatAuditLogDownload(entries: AuditLogEntry[]): string {
  return entries
    .map((entry) => `[${entry.createdAt}] ${entry.message}`)
    .join("\n");
}

export async function auditLogRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Querystring: { limit?: string } }>("/api/audit-logs", async (request, reply) => {
    getRequestUser(request);
    await requireAdmin(request, reply);
    if (reply.sent) return;

    const parsedLimit = request.query.limit ? Number(request.query.limit) : AUDIT_LOG_LIMIT;
    const limit =
      Number.isFinite(parsedLimit) && parsedLimit > 0
        ? Math.min(Math.floor(parsedLimit), AUDIT_LOG_LIMIT)
        : AUDIT_LOG_LIMIT;

    return { entries: listAuditLogs(limit) };
  });

  app.get("/api/audit-logs/download", async (request, reply) => {
    getRequestUser(request);
    await requireAdmin(request, reply);
    if (reply.sent) return;

    const entries = listAuditLogs(AUDIT_LOG_LIMIT);

    return reply
      .header("Content-Type", "text/plain; charset=utf-8")
      .header("Content-Disposition", 'attachment; filename="stackpatch-activity-log.txt"')
      .send(formatAuditLogDownload(entries));
  });
}
