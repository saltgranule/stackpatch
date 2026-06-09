import { v4 as uuid } from "uuid";
import { AUDIT_LOG_LIMIT, type AuditAction, type AuditLogEntry } from "@stackpatch/shared";
import { getDatabase } from "./database.js";

interface InsertAuditLogInput {
  userId: string | null;
  username: string;
  action: AuditAction;
  instanceId?: string | null;
  instanceName?: string | null;
  message: string;
}

function mapRow(row: {
  id: string;
  user_id: string | null;
  username: string;
  action: string;
  instance_id: string | null;
  instance_name: string | null;
  message: string;
  created_at: string;
}): AuditLogEntry {
  return {
    id: row.id,
    userId: row.user_id,
    username: row.username,
    action: row.action as AuditAction,
    instanceId: row.instance_id,
    instanceName: row.instance_name,
    message: row.message,
    createdAt: row.created_at,
  };
}

export function insertAuditLog(input: InsertAuditLogInput): AuditLogEntry {
  const database = getDatabase();
  const id = uuid();
  const createdAt = new Date().toISOString();

  database
    .prepare(
      `INSERT INTO audit_logs (
        id, user_id, username, action, instance_id, instance_name, message, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      id,
      input.userId,
      input.username,
      input.action,
      input.instanceId ?? null,
      input.instanceName ?? null,
      input.message,
      createdAt,
    );

  database
    .prepare(
      `DELETE FROM audit_logs
       WHERE id NOT IN (
         SELECT id FROM audit_logs ORDER BY created_at DESC LIMIT ?
       )`,
    )
    .run(AUDIT_LOG_LIMIT);

  return {
    id,
    userId: input.userId,
    username: input.username,
    action: input.action,
    instanceId: input.instanceId ?? null,
    instanceName: input.instanceName ?? null,
    message: input.message,
    createdAt,
  };
}

export function listAuditLogs(limit = AUDIT_LOG_LIMIT): AuditLogEntry[] {
  const database = getDatabase();
  const rows = database
    .prepare(
      `SELECT id, user_id, username, action, instance_id, instance_name, message, created_at
       FROM audit_logs
       ORDER BY created_at ASC
       LIMIT ?`,
    )
    .all(limit) as Array<{
    id: string;
    user_id: string | null;
    username: string;
    action: string;
    instance_id: string | null;
    instance_name: string | null;
    message: string;
    created_at: string;
  }>;

  return rows.map(mapRow);
}
