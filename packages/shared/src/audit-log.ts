export const AUDIT_LOG_LIMIT = 2000;

export type AuditAction =
  | "auth.login"
  | "auth.logout"
  | "instance.create"
  | "instance.update"
  | "instance.delete"
  | "instance.start"
  | "instance.stop"
  | "instance.terminate"
  | "instance.restart"
  | "file.upload"
  | "file.delete"
  | "file.create"
  | "file.rename"
  | "file.save"
  | "file.archive"
  | "file.unzip"
  | "user.create"
  | "user.update"
  | "user.delete"
  | "user.permission.set"
  | "user.permission.remove"
  | "settings.update"
  | "schedule.create"
  | "schedule.update"
  | "schedule.delete"
  | "schedule.fired"
  | "schedule.skipped"
  | "schedule.failed";

export interface AuditLogEntry {
  id: string;
  userId: string | null;
  username: string;
  action: AuditAction;
  instanceId: string | null;
  instanceName: string | null;
  message: string;
  createdAt: string;
}

export interface ListAuditLogsResult {
  entries: AuditLogEntry[];
}
