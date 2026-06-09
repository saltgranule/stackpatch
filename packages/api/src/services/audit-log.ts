import type { AuditAction, Instance } from "@stackpatch/shared";
import type { AuthUser } from "../auth/types.js";
import { insertAuditLog } from "../db/audit-logs.js";

type AuditUser = Pick<AuthUser, "id" | "username">;

export function recordAuditEvent(
  user: AuditUser | null,
  action: AuditAction,
  message: string,
  instance?: Pick<Instance, "id" | "name"> | null,
): void {
  insertAuditLog({
    userId: user?.id ?? null,
    username: user?.username ?? "system",
    action,
    instanceId: instance?.id ?? null,
    instanceName: instance?.name ?? null,
    message,
  });
}

export function summarizeInstanceUpdate(
  existing: Instance,
  body: {
    name?: string;
    applicationType?: string;
    startupCommand?: string;
    workingDirectory?: string;
    autoRestart?: boolean;
    maxRestartRetries?: number;
    stopCommand?: string;
  },
): string {
  const changes: string[] = [];

  if (body.name?.trim() && body.name.trim() !== existing.name) {
    changes.push(`renamed to "${body.name.trim()}"`);
  }
  if (body.applicationType && body.applicationType !== existing.applicationType) {
    changes.push(`type set to ${body.applicationType}`);
  }
  if (body.startupCommand?.trim()) {
    changes.push("startup command updated");
  }
  if (body.workingDirectory?.trim() && body.workingDirectory.trim() !== existing.workingDirectory) {
    changes.push("working directory updated");
  }
  if (body.autoRestart !== undefined && body.autoRestart !== existing.autoRestart) {
    changes.push(`auto-restart ${body.autoRestart ? "enabled" : "disabled"}`);
  }
  if (
    body.maxRestartRetries !== undefined &&
    body.maxRestartRetries !== existing.maxRestartRetries
  ) {
    changes.push(`max restart retries set to ${body.maxRestartRetries}`);
  }
  if (body.stopCommand !== undefined && body.stopCommand !== existing.stopCommand) {
    changes.push("stop command updated");
  }

  return changes.length > 0 ? changes.join(", ") : "settings updated";
}
