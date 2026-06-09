import type { SessionStore } from "@fastify/session";
import type { Session } from "fastify";
import { getDatabase } from "../db/database.js";

type StoredSession = Session & { userId?: string };

export class SqliteSessionStore implements SessionStore {
  get(sessionId: string, callback: (err: Error | null, session?: Session | null) => void): void {
    try {
      const database = getDatabase();
      const row = database
        .prepare("SELECT data, expires_at FROM sessions WHERE session_id = ?")
        .get(sessionId) as { data: string; expires_at: string } | undefined;

      if (!row) {
        callback(null, null);
        return;
      }

      if (new Date(row.expires_at).getTime() <= Date.now()) {
        database.prepare("DELETE FROM sessions WHERE session_id = ?").run(sessionId);
        callback(null, null);
        return;
      }

      callback(null, JSON.parse(row.data) as Session);
    } catch (error) {
      callback(error as Error);
    }
  }

  set(sessionId: string, session: Session, callback: (err?: Error | null) => void): void {
    try {
      const database = getDatabase();
      const stored = session as StoredSession;
      const maxAge = session.cookie.maxAge ?? 7 * 24 * 60 * 60 * 1000;
      const expiresAt = session.cookie.expires ?? new Date(Date.now() + maxAge);

      database
        .prepare(
          `INSERT INTO sessions (session_id, user_id, expires_at, data)
           VALUES (?, ?, ?, ?)
           ON CONFLICT(session_id) DO UPDATE SET
             user_id = excluded.user_id,
             expires_at = excluded.expires_at,
             data = excluded.data`,
        )
        .run(
          sessionId,
          stored.userId ?? null,
          expiresAt instanceof Date ? expiresAt.toISOString() : new Date(expiresAt).toISOString(),
          JSON.stringify(session),
        );

      callback();
    } catch (error) {
      callback(error as Error);
    }
  }

  destroy(sessionId: string, callback: (err?: Error | null) => void): void {
    try {
      const database = getDatabase();
      database.prepare("DELETE FROM sessions WHERE session_id = ?").run(sessionId);
      callback();
    } catch (error) {
      callback(error as Error);
    }
  }
}
