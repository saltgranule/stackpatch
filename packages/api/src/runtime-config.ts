import {
  DEFAULT_DAEMON_IPC_PORT,
  DEFAULT_PANEL_PORT,
  type SystemSettingsStatus,
} from "@stackpatch/shared";
import { getSystemSettings } from "./db/settings.js";

let activePanelPort = DEFAULT_PANEL_PORT;
let activeDaemonPort = DEFAULT_DAEMON_IPC_PORT;

function envPanelPort(): number | null {
  const raw = process.env.STACKPATCH_PORT;
  if (!raw) return null;
  const parsed = Number(raw);
  return Number.isInteger(parsed) ? parsed : null;
}

function envDaemonPort(): number | null {
  const raw = process.env.STACKPATCH_DAEMON_PORT;
  if (!raw) return null;
  const parsed = Number(raw);
  return Number.isInteger(parsed) ? parsed : null;
}

export function initializeRuntimeConfig(): { panelPort: number; daemonPort: number } {
  const settings = getSystemSettings();
  activePanelPort = envPanelPort() ?? settings.panelPort;
  activeDaemonPort = envDaemonPort() ?? settings.daemonPort;
  return { panelPort: activePanelPort, daemonPort: activeDaemonPort };
}

export function getActivePanelPort(): number {
  return activePanelPort;
}

export function getActiveDaemonPort(): number {
  return activeDaemonPort;
}

export function getSystemSettingsStatus(): SystemSettingsStatus {
  const settings = getSystemSettings();
  const panelEnvOverride = envPanelPort() !== null;
  const daemonEnvOverride = envDaemonPort() !== null;
  const restartRequired =
    (!panelEnvOverride && settings.panelPort !== activePanelPort) ||
    (!daemonEnvOverride && settings.daemonPort !== activeDaemonPort);

  return {
    settings,
    activePanelPort,
    activeDaemonPort,
    restartRequired,
    envOverrides: {
      panelPort: panelEnvOverride,
      daemonPort: daemonEnvOverride,
    },
  };
}
