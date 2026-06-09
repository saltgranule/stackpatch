import type { AuthUser, User, UserRole } from "./types.js";

export interface UserPolicyResult {
  allowed: boolean;
  reason?: string;
}

export function canDeleteUser(
  actor: AuthUser,
  target: Pick<User, "id" | "role">,
  adminCount: number,
): UserPolicyResult {
  if (actor.role !== "admin") {
    return { allowed: false, reason: "Admin access required" };
  }

  if (actor.id === target.id) {
    return { allowed: false, reason: "You cannot delete your own account" };
  }

  if (target.role === "admin" && adminCount <= 1) {
    return { allowed: false, reason: "Cannot delete the last admin account" };
  }

  return { allowed: true };
}

export function canChangeUserRole(
  actor: AuthUser,
  target: Pick<User, "id" | "role">,
  nextRole: UserRole,
  adminCount: number,
): UserPolicyResult {
  if (actor.role !== "admin") {
    return { allowed: false, reason: "Admin access required" };
  }

  if (actor.id === target.id && nextRole !== "admin") {
    return { allowed: false, reason: "You cannot remove your own admin access" };
  }

  if (target.role === "admin" && nextRole !== "admin" && adminCount <= 1) {
    return { allowed: false, reason: "Cannot demote the last admin account" };
  }

  return { allowed: true };
}
