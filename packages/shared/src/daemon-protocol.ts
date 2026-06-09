import type { InstanceStatus } from "./types.js";
import type { ApplicationType } from "./application-types.js";

export { DEFAULT_DAEMON_IPC_PORT } from "./constants.js";
export const DEFAULT_STOP_TIMEOUT_MS = 30_000;
export const DEFAULT_TERMINATE_TIMEOUT_MS = 3_000;
export const DEFAULT_TASK_TIMEOUT_MS = 600_000;

export interface InstanceProcessConfig {
  applicationType: ApplicationType;
  executablePath: string;
  arguments: string;
  workingDirectory: string;
  autoRestart: boolean;
  maxRestartRetries: number;
  stopCommand: string;
}

export interface InstanceRuntimeStatus {
  instanceId: string;
  status: InstanceStatus;
  pid: number | null;
  startedAt: string | null;
  exitCode: number | null;
  restartAttempts: number;
}

export interface LogLine {
  stream: "stdout" | "stderr";
  text: string;
  timestamp: string;
}

export type DaemonMethod =
  | "ping"
  | "start"
  | "stop"
  | "terminate"
  | "restart"
  | "getStatus"
  | "getLogs"
  | "subscribeLogs"
  | "subscribeStatus"
  | "sendInput"
  | "appendLog";

export interface DaemonSubscribeLogsResult {
  lines: LogLine[];
}

export interface DaemonSendInputResult {
  sent: boolean;
  mode: "stdin" | "task";
}

export interface DaemonLogEvent {
  event: "log";
  line: LogLine;
}

export interface DaemonSubscribeStatusResult {
  instances: InstanceRuntimeStatus[];
}

export interface DaemonStatusEvent {
  event: "status";
  runtime: InstanceRuntimeStatus;
}

export interface DaemonRequest {
  id: string;
  method: DaemonMethod;
  params?: Record<string, unknown>;
}

export interface DaemonResponse<T = unknown> {
  id: string;
  ok: boolean;
  result?: T;
  error?: string;
}

export interface DaemonPingResult {
  pid: number;
  managedInstances: number;
}

export interface DaemonGetStatusResult {
  instances: InstanceRuntimeStatus[];
}

export interface DaemonGetLogsResult {
  lines: LogLine[];
}

export interface DaemonAppendLogResult {
  line: LogLine;
}
