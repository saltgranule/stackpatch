import { randomBytes } from "node:crypto";
import { v4 as uuid } from "uuid";
import { getDatabase } from "../db/database.js";
import { countUsers, createUser } from "../db/users.js";
import { hashPassword } from "./password.js";

function getOrCreateSessionSecret(): string {
  const database = getDatabase();
  const row = database
    .prepare("SELECT value FROM system_settings WHERE key = 'session_secret'")
    .get() as { value: string } | undefined;

  if (row?.value) {
    return row.value;
  }

  const secret = randomBytes(32).toString("hex");
  database
    .prepare("INSERT INTO system_settings (key, value) VALUES ('session_secret', ?)")
    .run(secret);
  return secret;
}

export async function bootstrapAuth(): Promise<{ sessionSecret: string }> {
  const sessionSecret = getOrCreateSessionSecret();

  if (countUsers() === 0) {
    const password = process.env.STACKPATCH_ADMIN_PASSWORD ?? "changeme";
    const passwordHash = await hashPassword(password);
    createUser(uuid(), "admin", passwordHash, "admin");

    console.warn(
      "[stackpatch] Created default admin account (username: admin). " +
        "Set STACKPATCH_ADMIN_PASSWORD and change this password after first login.",
    );
  }

  return { sessionSecret };
}
