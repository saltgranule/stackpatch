import type { UserRole } from "./types.js";

const ROLE_RANK: Record<UserRole, number> = {
  viewer: 1,
  admin: 2,
};

export function roleAtLeast(role: UserRole, minimum: UserRole): boolean {
  return ROLE_RANK[role] >= ROLE_RANK[minimum];
}

export function getEffectiveInstanceRole(
  globalRole: UserRole,
  permissionRole: UserRole | null | undefined,
): UserRole | null {
  if (globalRole === "admin") {
    return "admin";
  }

  return permissionRole ?? null;
}

export function canAccessInstanceRole(
  globalRole: UserRole,
  permissionRole: UserRole | null | undefined,
  minimum: UserRole,
): boolean {
  const effectiveRole = getEffectiveInstanceRole(globalRole, permissionRole);
  if (!effectiveRole) {
    return false;
  }

  return roleAtLeast(effectiveRole, minimum);
}
