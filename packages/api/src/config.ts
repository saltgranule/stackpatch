import path from "node:path";
import { resolveDataDir } from "@stackpatch/shared";

const dataDir = resolveDataDir();

export const config = {
  host: process.env.STACKPATCH_HOST ?? "127.0.0.1",
  dataDir,
  dbPath: path.join(dataDir, "stackpatch.db"),
  daemonSocketPath:
    process.env.STACKPATCH_DAEMON_SOCKET ?? path.join(dataDir, "daemon.sock"),
  daemonIpcHost: process.env.STACKPATCH_DAEMON_HOST ?? "127.0.0.1",
} as const;
