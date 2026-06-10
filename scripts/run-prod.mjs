import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  createOrchestratorLogger,
  killChildTree,
  runQuiet,
  startService,
  waitForServicesReady,
} from "./orchestrator-common.mjs";
import { readSystemPorts } from "./read-system-ports.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const logsDir = path.join(root, ".data", "logs");
const logFile = path.join(logsDir, "prod.log");
const args = new Set(process.argv.slice(2));
const skipInstall = args.has("--skip-install");
const skipBuild = args.has("--skip-build");

// Install/build need devDependencies (tsc, vite, etc.). Only runtime services use production mode.
const buildEnv = {
  ...process.env,
  NODE_ENV: "development",
  // Non-interactive pnpm (no Y/n prompts when launched from start.bat).
  CI: process.env.CI ?? "1",
};

const serviceEnv = {
  ...process.env,
  NODE_ENV: "production",
};

fs.mkdirSync(logsDir, { recursive: true });
const logStream = fs.createWriteStream(logFile, { flags: "a" });
const { write, log } = createOrchestratorLogger(logStream);

const children = [];
let shuttingDown = false;
const startupAbort = new AbortController();

function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  startupAbort.abort();
  log("stackpatch", "shutting down...");
  for (const child of children) {
    killChildTree(child);
  }
  logStream.end(() => process.exit(code));
  setTimeout(() => process.exit(code), 1000).unref();
}

function handleServiceExit(service) {
  return (_code, signal, { wasReady } = {}) => {
    if (shuttingDown) return;
    const reason = signal ? `signal ${signal}` : `code ${_code ?? 1}`;
    log(service, wasReady ? `stopped after ready (${reason})` : `stopped (${reason})`);
    shutdown(_code ?? 1);
  };
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

async function main() {
  const ports = readSystemPorts(root);

  write("");
  write("stackpatch production");
  write(`  Panel:  http://localhost:${ports.panelPort}`);
  write(`  Daemon: 127.0.0.1:${ports.daemonPort}`);
  write(`  Log:    ${logFile}`);
  write("");

  if (!skipInstall) {
    log("stackpatch", "installing dependencies...");
    await runQuiet(root, buildEnv, "npx", ["--yes", "pnpm@9.15.9", "install", "--frozen-lockfile"], logStream);
  }

  if (!skipBuild) {
    log("stackpatch", "building packages...");
    await runQuiet(root, buildEnv, "npx", ["--yes", "pnpm@9.15.9", "build"], logStream);
  }

  const daemon = startService({
    root,
    env: serviceEnv,
    log,
    service: "daemon",
    filter: "@stackpatch/daemon",
    runScript: "start",
    onExit: handleServiceExit("daemon"),
  });
  const panel = startService({
    root,
    env: serviceEnv,
    log,
    service: "panel",
    filter: "@stackpatch/api",
    runScript: "start",
    onExit: handleServiceExit("panel"),
  });

  children.push(daemon.child, panel.child);
  await waitForServicesReady([daemon, panel], { signal: startupAbort.signal });
  if (shuttingDown) {
    return;
  }
  log("stackpatch", "stackpatch is ready.");
}

main().catch((error) => {
  if (shuttingDown) {
    return;
  }
  log("stackpatch", error instanceof Error ? error.message : String(error));
  shutdown(1);
});
