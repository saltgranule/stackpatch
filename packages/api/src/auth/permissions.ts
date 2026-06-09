import type { UserRole } from "@stackpatch/shared";
import { canAccessInstanceRole, getEffectiveInstanceRole, roleAtLeast } from "@stackpatch/shared";
import { getInstancePermission } from "../db/users.js";
import type { AuthUser } from "./types.js";

export { roleAtLeast, getEffectiveInstanceRole };

export function canAccessInstance(
  user: AuthUser,
  instanceId: string,
  minimum: UserRole,
): boolean {
  const permissionRole =
    user.instancePermissions?.find((permission) => permission.instanceId === instanceId)?.role ??
    getInstancePermission(user.id, instanceId)?.role;

  return canAccessInstanceRole(user.role, permissionRole, minimum);
}
