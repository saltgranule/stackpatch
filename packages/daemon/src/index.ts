import { StackpatchDaemon } from "./daemon.js";
import { forceKillAllRegistered } from "./pid-registry.js";

const daemon = new StackpatchDaemon();
let shuttingDown = false;

async function shutdown(exitCode = 0): Promise<void> {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;

  try {
    await daemon.stop();
  } catch (error) {
    console.error(error);
    const killed = forceKillAllRegistered();
    if (killed > 0) {
      console.log(`[stackpatch] force-killed ${killed} instance process(es) during shutdown`);
    }
  } finally {
    process.exit(exitCode);
  }
}

async function main() {
  await daemon.start();

  process.on("SIGINT", () => {
    void shutdown(0);
  });
  process.on("SIGTERM", () => {
    void shutdown(0);
  });

  if (process.platform === "win32") {
    process.on("SIGBREAK", () => {
      void shutdown(0);
    });
  }

  process.on("uncaughtException", (error) => {
    console.error(error);
    void shutdown(1);
  });

  process.on("unhandledRejection", (reason) => {
    console.error(reason);
    void shutdown(1);
  });

  // Last-resort cleanup if the daemon exits without a graceful stop (hard kill, crash).
  process.on("exit", () => {
    const killed = forceKillAllRegistered();
    if (killed > 0) {
      console.log(`[stackpatch] force-killed ${killed} instance process(es) on exit`);
    }
  });
}

main().catch((error) => {
  console.error(error);
  forceKillAllRegistered();
  process.exit(1);
});
