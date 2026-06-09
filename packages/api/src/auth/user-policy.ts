import { canChangeUserRole, canDeleteUser, type AuthUser, type User, type UserRole } from "@stackpatch/shared";
import { countUsersWithRole, getUserById } from "../db/users.js";

export interface PolicyResult {
  allowed: boolean;
  status?: number;
  error?: string;
}

function deny(status: number, error: string): PolicyResult {
  return { allowed: false, status, error };
}

export function assertAdmin(actor: AuthUser): PolicyResult {
  if (actor.role !== "admin") {
    return deny(403, "Admin access required");
  }
  return { allowed: true };
}

export function validateUserDeletion(actor: AuthUser, targetUserId: string): PolicyResult {
  const adminCheck = assertAdmin(actor);
  if (!adminCheck.allowed) {
    return adminCheck;
  }

  const target = getUserById(targetUserId);
  if (!target) {
    return deny(404, "User not found");
  }

  const result = canDeleteUser(actor, target, countUsersWithRole("admin"));
  if (!result.allowed) {
    return deny(400, result.reason ?? "Cannot delete user");
  }

  return { allowed: true };
}

export function validateRoleChange(
  actor: AuthUser,
  targetUser: User,
  nextRole: UserRole,
): PolicyResult {
  const adminCheck = assertAdmin(actor);
  if (!adminCheck.allowed) {
    return adminCheck;
  }

  const result = canChangeUserRole(actor, targetUser, nextRole, countUsersWithRole("admin"));
  if (!result.allowed) {
    return deny(400, result.reason ?? "Cannot change user role");
  }

  return { allowed: true };
}
