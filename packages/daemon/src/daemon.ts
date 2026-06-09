import fs from "node:fs";
import { APP_NAME } from "@stackpatch/shared";
import { daemonConfig } from "./config.js";
import { startHeartbeat } from "./heartbeat-writer.js";
import { IpcServer } from "./ipc-server.js";
import { ProcessManager } from "./process-manager.js";
import { ScheduleRunner } from "./schedule-runner.js";
import { resolveDaemonPort } from "./settings.js";

export interface DaemonState {
  running: boolean;
  managedInstances: number;
}

export class StackpatchDaemon {
  private stopHeartbeat: (() => void) | null = null;
  private ipcPort = 0;
  private readonly processManager = new ProcessManager();
  private readonly ipcServer = new IpcServer(this.processManager);
  private readonly scheduleRunner = new ScheduleRunner(this.processManager);

  getState(): DaemonState {
    return {
      running: this.stopHeartbeat !== null,
      managedInstances: this.processManager.getRuntimeStatus().length,
    };
  }

  async start(): Promise<void> {
    fs.mkdirSync(daemonConfig.dataDir, { recursive: true });
    this.ipcPort = resolveDaemonPort();
    await this.processManager.initialize();
    await this.ipcServer.start(this.ipcPort);
    this.scheduleRunner.start();
    this.stopHeartbeat = startHeartbeat(daemonConfig.heartbeatPath);

    console.log(`[${APP_NAME}] daemon ready on ${daemonConfig.ipcHost}:${this.ipcPort}`);
  }

  async stop(): Promise<void> {
    this.stopHeartbeat?.();
    this.stopHeartbeat = null;

    await this.processManager.shutdown();
    this.scheduleRunner.stop();
    await this.ipcServer.stop();

    console.log(`[${APP_NAME}] daemon stopped`);
  }
}
