import type { AuthUser, InstanceStatus, UserRole } from "@stackpatch/shared";
import { getEffectiveInstanceRole, roleAtLeast } from "@stackpatch/shared";

export const DELETE_INSTANCE_CONFIRM =
  "Delete instance \"{name}\"? This stops the process and removes it from the panel. Files on disk are not deleted.";

function getPermissionRole(user: AuthUser, instanceId: string): UserRole | null | undefined {
  return user.instancePermissions?.find((permission) => permission.instanceId === instanceId)?.role;
}

export function isGlobalAdmin(user: AuthUser): boolean {
  return user.role === "admin";
}

export function canControlInstance(user: AuthUser, instanceId: string): boolean {
  const effectiveRole = getEffectiveInstanceRole(user.role, getPermissionRole(user, instanceId));
  return effectiveRole !== null && roleAtLeast(effectiveRole, "admin");
}

export function canEditInstance(user: AuthUser, instanceId: string): boolean {
  return canControlInstance(user, instanceId);
}

export function canDeleteInstance(user: AuthUser): boolean {
  return isGlobalAdmin(user);
}

export function canStartInstance(status: InstanceStatus): boolean {
  return status === "stopped" || status === "crashed";
}

export function canStopInstance(status: InstanceStatus): boolean {
  return status === "running" || status === "starting";
}

export function formatDeleteInstanceConfirm(name: string): string {
  return DELETE_INSTANCE_CONFIRM.replace("{name}", name);
}
