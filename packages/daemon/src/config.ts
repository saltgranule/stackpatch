import path from "node:path";
import { resolveDataDir } from "@stackpatch/shared";

const dataDir = resolveDataDir();

export const daemonConfig = {
  dataDir,
  heartbeatPath: path.join(dataDir, "daemon.sock"),
  pidRegistryPath: path.join(dataDir, "pid-registry.json"),
  ipcHost: process.env.STACKPATCH_DAEMON_HOST ?? "127.0.0.1",
  logBufferSize: 2000,
} as const;
