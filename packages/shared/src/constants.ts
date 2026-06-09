export const APP_NAME = "stackpatch";
export const APP_VERSION = "0.1.0";
export const DEFAULT_PANEL_PORT = 23333;
export const DEFAULT_DAEMON_IPC_PORT = 24444;

export function isValidPort(port: number): boolean {
  return Number.isInteger(port) && port >= 1 && port <= 65535;
}
export const DEFAULT_STOP_COMMAND = "stop";
/** Max console lines kept in memory, on disk, and sent to the browser on connect. */
export const LOG_BUFFER_SIZE = 500;
/** Fallback interval for reconciling instance status when push events may have been missed. */
export const STATUS_RECONCILE_INTERVAL_MS = 60_000;
export const BCRYPT_COST_FACTOR = 12;

export const THEME_COLORS = {
  light: {
    background: "#F4F1DE",
    accent: "#E07A5F",
    success: "#81B29A",
  },
  dark: {
    background: "#2B2D30",
    accent: "#E07A5F",
    success: "#81B29A",
  },
} as const;
