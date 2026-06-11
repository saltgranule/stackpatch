export type InstanceStatus = "running" | "stopped" | "crashed" | "starting" | "stopping";

export type UserRole = "admin" | "viewer";

export type ThemePreference = "light" | "dark" | "system";

export type { ApplicationType } from "./application-types.js";

import type { ApplicationType } from "./application-types.js";

export interface Instance {
  id: string;
  name: string;
  applicationType: ApplicationType;
  executablePath: string;
  arguments: string;
  startupCommand: string;
  workingDirectory: string;
  memoryLimitMb: number | null;
  cpuLimitPercent: number | null;
  autoRestart: boolean;
  maxRestartRetries: number;
  stopCommand: string;
  status: InstanceStatus;
  pid: number | null;
  lastStartedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface User {
  id: string;
  username: string;
  role: UserRole;
  theme: ThemePreference;
  createdAt: string;
  lastLoginAt: string | null;
}

export interface UserWithPermissions extends User {
  instancePermissions: InstancePermission[];
}

export interface AuthUser {
  id: string;
  username: string;
  role: UserRole;
  theme: ThemePreference;
  instancePermissions?: InstancePermission[];
}

export interface InstancePermission {
  id: string;
  userId: string;
  instanceId: string;
  role: UserRole;
}

export interface SystemSettings {
  panelPort: number;
  daemonPort: number;
  maxUploadFileSizeMb: number;
}

export interface SystemSettingsStatus {
  settings: SystemSettings;
  activePanelPort: number;
  activeDaemonPort: number;
  restartRequired: boolean;
  envOverrides: {
    panelPort: boolean;
    daemonPort: boolean;
  };
}

export interface HealthResponse {
  status: "ok";
  version: string;
  daemon: "connected" | "disconnected";
  panelPort: number;
  daemonPort: number;
}
