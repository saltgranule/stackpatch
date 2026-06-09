import type { AuthUser, Instance } from "@stackpatch/shared";
import { getDatabase } from "../db/database.js";
import { listInstances } from "../db/instances.js";

export function listInstancesForUser(user: AuthUser): Instance[] {
  const instances = listInstances();

  if (user.role === "admin") {
    return instances;
  }

  const database = getDatabase();
  const rows = database
    .prepare("SELECT instance_id FROM instance_permissions WHERE user_id = ?")
    .all(user.id) as Array<{ instance_id: string }>;

  const allowedIds = new Set(rows.map((row) => row.instance_id));
  return instances.filter((instance) => allowedIds.has(instance.id));
}
