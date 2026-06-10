import { execSync, spawn } from "node:child_process";

const DEFAULT_READY_TIMEOUT_MS = 120_000;

/** Matches console output from packages/daemon and packages/api on startup. */
const SERVICE_READY_MARKERS = {
  daemon: /daemon ready on/i,
  panel: /panel ready on|Server listening at/i,
};

export function shouldSuppressSpawnStderr(text) {
  return text.includes("DEP0190");
}

export function createOrchestratorLogger(logStream) {
  function write(line) {
    process.stdout.write(`${line}\n`);
    logStream.write(`${line}\n`);
  }

  function log(service, message) {
    const now = new Date();
    const shortTimestamp = now.toTimeString().slice(0, 8);
    process.stdout.write(`[${shortTimestamp}] [${service}] ${message}\n`);
    logStream.write(`[${now.toISOString()}] [${service}] ${message}\n`);
  }

  return { write, log };
}

export function runQuiet(root, env, command, commandArgs, logStream) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, commandArgs, {
      cwd: root,
      env,
      stdio: ["ignore", "ignore", "pipe"],
      // Tech debt: shell: true triggers Node DEP0190 on Windows. Prefer explicit
      // cmd.exe /c spawning — see packages/daemon/src/spawn-instance-process.ts.
      shell: process.platform === "win32",
    });

    child.stderr?.on("data", (chunk) => {
      const text = chunk.toString();
      if (shouldSuppressSpawnStderr(text)) {
        return;
      }
      process.stderr.write(text);
      logStream.write(text);
    });

    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${command} exited with code ${code}`));
      }
    });
  });
}

export function killChildTree(child) {
  if (!child.pid) {
    return;
  }

  try {
    if (process.platform === "win32") {
      execSync(`taskkill /F /T /PID ${child.pid}`, { stdio: "ignore", windowsHide: true });
    } else {
      process.kill(-child.pid, "SIGTERM");
    }
  } catch {
    try {
      child.kill("SIGTERM");
    } catch {
    }
  }
}

function pipeServiceOutput(log, service, stream, isError, onLine) {
  stream.on("data", (chunk) => {
    for (const line of chunk.toString().split(/\r?\n/)) {
      if (!line.trim() || line.includes("DEP0190")) {
        continue;
      }
      onLine(line, isError);
    }
  });
}

export function startService({ root, env, log, service, filter, runScript, onExit }) {
  let readySettled = false;
  let resolveReady;
  let rejectReady;

  const ready = new Promise((resolve, reject) => {
    resolveReady = resolve;
    rejectReady = reject;
  });

  function markReady() {
    if (readySettled) {
      return;
    }
    readySettled = true;
    resolveReady();
  }

  function markReadyFailed(error) {
    if (readySettled) {
      return;
    }
    readySettled = true;
    rejectReady(error);
  }

  function handleServiceLine(line, isError) {
    const readyMarker = SERVICE_READY_MARKERS[service];
    if (readyMarker?.test(line)) {
      markReady();
    }
    log(service, isError ? `[stderr] ${line}` : line);
  }

  const child = spawn(
    "npx",
    ["--yes", "pnpm@9.15.9", "--filter", filter, "run", runScript],
    {
      cwd: root,
      env,
      stdio: ["ignore", "pipe", "pipe"],
      detached: process.platform !== "win32",
      // Tech debt: shell: true triggers Node DEP0190 on Windows. Prefer explicit
      // cmd.exe /c spawning — see packages/daemon/src/spawn-instance-process.ts.
      shell: process.platform === "win32",
    },
  );

  pipeServiceOutput(log, service, child.stdout, false, handleServiceLine);
  pipeServiceOutput(log, service, child.stderr, true, handleServiceLine);

  child.on("exit", (code, signal) => {
    const reason = signal ? `signal ${signal}` : `code ${code ?? 1}`;
    if (!readySettled) {
      markReadyFailed(new Error(`${service} exited before becoming ready (${reason})`));
    }
    onExit?.(code, signal, { wasReady: readySettled });
  });

  return { child, ready };
}

export function waitForServicesReady(services, options = {}) {
  const { timeoutMs = DEFAULT_READY_TIMEOUT_MS, signal } = options;
  let timeoutId;
  let abortHandler;

  if (signal?.aborted) {
    return Promise.reject(new Error("Startup aborted while waiting for services"));
  }

  const readyAll = Promise.all(services.map((service) => service.ready));

  const timeout = new Promise((_, reject) => {
    timeoutId = setTimeout(
      () => reject(new Error("Timed out waiting for services to become ready")),
      timeoutMs,
    );
  });

  const aborted = new Promise((_, reject) => {
    if (!signal) {
      return;
    }

    abortHandler = () => {
      reject(new Error("Startup aborted while waiting for services"));
    };
    signal.addEventListener("abort", abortHandler, { once: true });
  });

  const racers = signal ? [readyAll, timeout, aborted] : [readyAll, timeout];

  return Promise.race(racers).finally(() => {
    clearTimeout(timeoutId);
    if (signal && abortHandler) {
      signal.removeEventListener("abort", abortHandler);
    }
  });
}
