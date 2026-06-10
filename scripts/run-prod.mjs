import { execSync, spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
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

function write(line) {
  process.stdout.write(`${line}\n`);
  logStream.write(`${line}\n`);
}

function log(service, message) {
  write(`[${new Date().toISOString()}] [${service}] ${message}`);
}

function run(command, commandArgs, env = buildEnv) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, commandArgs, {
      cwd: root,
      env,
      stdio: "inherit",
      shell: process.platform === "win32",
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} exited with code ${code}`));
    });
  });
}

function startService(service, filter) {
  const child = spawn(
    "npx",
    ["--yes", "pnpm@9.15.9", "--filter", filter, "run", "start"],
    {
      cwd: root,
      env: serviceEnv,
      shell: process.platform === "win32",
      stdio: ["ignore", "pipe", "pipe"],
    },
  );

  const pipe = (stream, isError) => {
    stream.on("data", (chunk) => {
      for (const line of chunk.toString().split(/\r?\n/)) {
        if (!line.trim()) continue;
        log(service, isError ? `[stderr] ${line}` : line);
      }
    });
  };

  pipe(child.stdout, false);
  pipe(child.stderr, true);

  child.on("exit", (code, signal) => {
    if (shuttingDown) return;
    const reason = signal ? `signal ${signal}` : `code ${code ?? 1}`;
    log(service, `stopped (${reason})`);
    shutdown(code ?? 1);
  });

  return child;
}

const children = [];
let shuttingDown = false;

function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  log("stackpatch", "shutting down...");
  for (const child of children) {
    try {
      if (process.platform === "win32" && child.pid) {
        execSync(`taskkill /F /T /PID ${child.pid}`, { stdio: "ignore", windowsHide: true });
      } else {
        child.kill();
      }
    } catch {
    }
  }
  logStream.end(() => process.exit(code));
  setTimeout(() => process.exit(code), 1000).unref();
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

  if (!skipInstall && !fs.existsSync(path.join(root, "node_modules"))) {
    log("stackpatch", "installing dependencies...");
    await run("npx", ["--yes", "pnpm@9.15.9", "install"]);
  }

  if (!skipBuild) {
    log("stackpatch", "building packages...");
    await run("npx", ["--yes", "pnpm@9.15.9", "build"]);
  }

  children.push(startService("daemon", "@stackpatch/daemon"));
  children.push(startService("panel", "@stackpatch/api"));
}

main().catch((error) => {
  log("stackpatch", error instanceof Error ? error.message : String(error));
  shutdown(1);
});
