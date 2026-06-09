import type { AuthUser, InstancePermission, User, UserRole, UserWithPermissions } from "@stackpatch/shared";
import { getDatabase } from "./database.js";

interface UserRow {
  id: string;
  username: string;
  password_hash: string;
  role: UserRole;
  theme: User["theme"];
  created_at: string;
  last_login_at: string | null;
}

interface PermissionRow {
  id: string;
  user_id: string;
  instance_id: string;
  role: UserRole;
}

function mapUser(row: UserRow): User {
  return {
    id: row.id,
    username: row.username,
    role: row.role,
    theme: row.theme,
    createdAt: row.created_at,
    lastLoginAt: row.last_login_at,
  };
}

export function recordUserLogin(userId: string): void {
  const database = getDatabase();
  database
    .prepare("UPDATE users SET last_login_at = ? WHERE id = ?")
    .run(new Date().toISOString(), userId);
}

function mapPermission(row: PermissionRow): InstancePermission {
  return {
    id: row.id,
    userId: row.user_id,
    instanceId: row.instance_id,
    role: row.role,
  };
}

export function countUsers(): number {
  const database = getDatabase();
  const row = database.prepare("SELECT COUNT(*) as count FROM users").get() as { count: number };
  return row.count;
}

export function countUsersWithRole(role: UserRole): number {
  const database = getDatabase();
  const row = database
    .prepare("SELECT COUNT(*) as count FROM users WHERE role = ?")
    .get(role) as { count: number };
  return row.count;
}

export function getUserByUsername(username: string): (User & { passwordHash: string }) | null {
  const database = getDatabase();
  const row = database
    .prepare("SELECT * FROM users WHERE username = ?")
    .get(username) as UserRow | undefined;

  if (!row) {
    return null;
  }

  return { ...mapUser(row), passwordHash: row.password_hash };
}

export function getUserById(id: string): User | null {
  const database = getDatabase();
  const row = database.prepare("SELECT * FROM users WHERE id = ?").get(id) as UserRow | undefined;
  return row ? mapUser(row) : null;
}

export function getInstancePermissionsForUser(userId: string): InstancePermission[] {
  const database = getDatabase();
  const rows = database
    .prepare("SELECT * FROM instance_permissions WHERE user_id = ?")
    .all(userId) as unknown as PermissionRow[];

  return rows.map(mapPermission);
}

export function getAuthUserById(id: string): AuthUser | null {
  const user = getUserById(id);
  if (!user) {
    return null;
  }

  return {
    id: user.id,
    username: user.username,
    role: user.role,
    theme: user.theme,
    instancePermissions: getInstancePermissionsForUser(user.id),
  };
}

export function listUsers(): UserWithPermissions[] {
  const database = getDatabase();
  const users = database
    .prepare("SELECT * FROM users ORDER BY created_at ASC")
    .all() as unknown as UserRow[];
  const permissions = database
    .prepare("SELECT * FROM instance_permissions")
    .all() as unknown as PermissionRow[];

  return users.map((row) => ({
    ...mapUser(row),
    instancePermissions: permissions
      .filter((permission) => permission.user_id === row.id)
      .map(mapPermission),
  }));
}

export function createUser(
  id: string,
  username: string,
  passwordHash: string,
  role: UserRole,
): User {
  const database = getDatabase();
  database
    .prepare("INSERT INTO users (id, username, password_hash, role) VALUES (?, ?, ?, ?)")
    .run(id, username, passwordHash, role);
  return getUserById(id)!;
}

export function updateUser(
  id: string,
  input: {
    username?: string;
    role?: UserRole;
    theme?: User["theme"];
    passwordHash?: string;
  },
): User | null {
  const existing = getUserById(id);
  if (!existing) {
    return null;
  }

  const database = getDatabase();
  database
    .prepare(
      `UPDATE users SET
        username = ?,
        role = ?,
        theme = ?,
        password_hash = COALESCE(?, password_hash)
      WHERE id = ?`,
    )
    .run(
      input.username ?? existing.username,
      input.role ?? existing.role,
      input.theme ?? existing.theme,
      input.passwordHash ?? null,
      id,
    );

  return getUserById(id);
}

export function deleteUser(id: string): boolean {
  const database = getDatabase();
  const result = database.prepare("DELETE FROM users WHERE id = ?").run(id);
  return result.changes > 0;
}

export function getInstancePermission(
  userId: string,
  instanceId: string,
): InstancePermission | null {
  const database = getDatabase();
  const row = database
    .prepare("SELECT * FROM instance_permissions WHERE user_id = ? AND instance_id = ?")
    .get(userId, instanceId) as PermissionRow | undefined;
  return row ? mapPermission(row) : null;
}

export function setInstancePermission(
  id: string,
  userId: string,
  instanceId: string,
  role: UserRole,
): InstancePermission {
  const database = getDatabase();
  database
    .prepare(
      `INSERT INTO instance_permissions (id, user_id, instance_id, role)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(user_id, instance_id) DO UPDATE SET role = excluded.role`,
    )
    .run(id, userId, instanceId, role);
  return getInstancePermission(userId, instanceId)!;
}

export function removeInstancePermission(userId: string, instanceId: string): void {
  const database = getDatabase();
  database
    .prepare("DELETE FROM instance_permissions WHERE user_id = ? AND instance_id = ?")
    .run(userId, instanceId);
}
