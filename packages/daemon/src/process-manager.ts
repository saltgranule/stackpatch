import fs from "node:fs";
import { spawn, type ChildProcess } from "node:child_process";
import type {
  InstanceProcessConfig,
  InstanceRuntimeStatus,
  InstanceStatus,
  LogLine,
} from "@stackpatch/shared";
import {
  DEFAULT_STOP_COMMAND,
  DEFAULT_TASK_TIMEOUT_MS,
  DEFAULT_TERMINATE_TIMEOUT_MS,
  getForceStopTimeoutMs,
  getGracefulStopTimeoutMs,
  LOG_BUFFER_SIZE,
  PathSecurityError,
  shouldUseStdinStop,
  validateStartupCommandFiles,
} from "@stackpatch/shared";
import { LogBuffer } from "./log-buffer.js";
import { appendPersistedLogs, loadPersistedLogs } from "./log-store.js";
import { parseArguments } from "./parse-arguments.js";
import { spawnInstanceProcess } from "./spawn-instance-process.js";
import {
  forceKillAllRegistered,
  isProcessAlive,
  killProcess,
  PidRegistry,
} from "./pid-registry.js";
import {
  createWindowsInstanceJob,
  isMemoryLimitExitCode,
  type WindowsKillJob,
} from "./windows-kill-job.js";

interface ManagedProcess {
  config: InstanceProcessConfig;
  process: ChildProcess | null;
  taskProcess: ChildProcess | null;
  taskTimeout: NodeJS.Timeout | null;
  status: InstanceStatus;
  logBuffer: LogBuffer;
  startedAt: string | null;
  exitCode: number | null;
  restartAttempts: number;
  stopping: boolean;
  intentionalStop: boolean;
  restartTimer: NodeJS.Timeout | null;
  windowsJob: WindowsKillJob | null;
}

type LogSubscriber = (line: LogLine) => void;
type StatusSubscriber = (status: InstanceRuntimeStatus) => void;

export class ProcessManager {
  private readonly processes = new Map<string, ManagedProcess>();
  private readonly pidRegistry = new PidRegistry();
  private readonly logSubscribers = new Map<string, Set<LogSubscriber>>();
  private readonly statusSubscribers = new Set<StatusSubscriber>();
  private readonly lifecycleTails = new Map<string, Promise<void>>();

  async initialize(): Promise<void> {
    const killed = forceKillAllRegistered();
    if (killed > 0) {
      console.log(`[stackpatch] terminated ${killed} leftover instance process(es) from prior daemon run`);
    }
  }

  getRuntimeStatus(instanceId?: string): InstanceRuntimeStatus[] {
    if (instanceId) {
      const managed = this.processes.get(instanceId);
      if (!managed) {
        return [
          {
            instanceId,
            status: "stopped",
            pid: null,
            startedAt: null,
            exitCode: null,
            restartAttempts: 0,
          },
        ];
      }
      return [this.toRuntimeStatus(instanceId, managed)];
    }

    return [...this.processes.entries()].map(([id, managed]) =>
      this.toRuntimeStatus(id, managed),
    );
  }

  getLogs(instanceId: string, lines = LOG_BUFFER_SIZE): LogLine[] {
    const managed = this.processes.get(instanceId);
    if (managed) {
      return managed.logBuffer.getLines(lines);
    }
    return loadPersistedLogs(instanceId, lines);
  }

  appendSystemLog(
    instanceId: string,
    text: string,
    stream: LogLine["stream"] = "stderr",
  ): LogLine[] {
    const managed = this.processes.get(instanceId);
    const lines = managed
      ? managed.logBuffer.appendLine(stream, text)
      : this.createLogBuffer(instanceId).appendLine(stream, text);
    this.publishLogs(instanceId, lines);
    return lines;
  }

  subscribeLogs(instanceId: string, subscriber: LogSubscriber): () => void {
    const listeners = this.logSubscribers.get(instanceId) ?? new Set<LogSubscriber>();
    listeners.add(subscriber);
    this.logSubscribers.set(instanceId, listeners);

    return () => {
      listeners.delete(subscriber);
      if (listeners.size === 0) {
        this.logSubscribers.delete(instanceId);
      }
    };
  }

  subscribeStatus(subscriber: StatusSubscriber): () => void {
    this.statusSubscribers.add(subscriber);
    return () => {
      this.statusSubscribers.delete(subscriber);
    };
  }

  private publishStatus(instanceId: string): void {
    if (this.statusSubscribers.size === 0) {
      return;
    }

    const managed = this.processes.get(instanceId);
    const runtime = managed
      ? this.toRuntimeStatus(instanceId, managed)
      : {
          instanceId,
          status: "stopped" as const,
          pid: null,
          startedAt: null,
          exitCode: null,
          restartAttempts: 0,
        };

    for (const subscriber of this.statusSubscribers) {
      subscriber(runtime);
    }
  }

  sendConsoleInput(
    instanceId: string,
    text: string,
    config: InstanceProcessConfig,
  ): { sent: boolean; mode: "stdin" | "task"; error?: string } {
    const managed = this.processes.get(instanceId);
    if (
      managed?.process &&
      this.isChildRunning(managed.process) &&
      !managed.stopping
    ) {
      if (!this.writeToStdin(managed, text)) {
        return { sent: false, mode: "stdin", error: "Process stdin is not available" };
      }
      return { sent: true, mode: "stdin" };
    }

    return this.runOneOffCommand(instanceId, config, text);
  }

  private writeToStdin(managed: ManagedProcess, text: string): boolean {
    const stdin = managed.process?.stdin;
    if (!stdin || stdin.destroyed || !stdin.writable) {
      return false;
    }

    const payload = text.endsWith("\n") ? text : `${text}\n`;
    try {
      stdin.write(payload);
      return true;
    } catch {
      return false;
    }
  }

  private async flushStdin(managed: ManagedProcess, text: string): Promise<boolean> {
    const stdin = managed.process?.stdin;
    if (!stdin || stdin.destroyed || !stdin.writable) {
      return false;
    }

    const payload = text.endsWith("\n") ? text : `${text}\n`;
    try {
      if (stdin.write(payload)) {
        return true;
      }

      await new Promise<void>((resolve, reject) => {
        const onDrain = () => {
          stdin.off("error", onError);
          resolve();
        };
        const onError = () => {
          stdin.off("drain", onDrain);
          reject(new Error("stdin write failed"));
        };
        stdin.once("drain", onDrain);
        stdin.once("error", onError);
      });
      return true;
    } catch {
      return false;
    }
  }

  private closeStdinForShutdown(managed: ManagedProcess): void {
    const stdin = managed.process?.stdin;
    if (!stdin || stdin.destroyed) {
      return;
    }

    try {
      stdin.end();
    } catch {
    }
  }

  private sendTerminationSignal(managed: ManagedProcess): void {
    const pid = managed.process?.pid;
    if (!pid || !this.isChildRunning(managed.process)) {
      return;
    }

    killProcess(pid, false, true);
  }

  private killInstancePids(pids: number[], force: boolean): void {
    for (const pid of pids) {
      if (this.isPidAlive(pid, null)) {
        killProcess(pid, force, true);
      }
    }
  }

  private isPidAlive(pid: number, child: ChildProcess | null): boolean {
    if (pid <= 0) {
      return false;
    }

    if (child?.pid === pid && !this.isChildRunning(child)) {
      return false;
    }

    return isProcessAlive(pid);
  }

  private areProcessesAlive(child: ChildProcess | null, pids: number[]): boolean {
    const tracked = [...new Set(pids.filter((pid) => pid > 0))];
    return tracked.some((pid) => this.isPidAlive(pid, child));
  }

  private async gracefulShutdown(
    instanceId: string,
    managed: ManagedProcess,
    child: ChildProcess | null,
    pids: number[],
  ): Promise<InstanceRuntimeStatus> {
    const gracefulTimeoutMs = getGracefulStopTimeoutMs(managed.config.applicationType);
    const forceTimeoutMs = getForceStopTimeoutMs(managed.config.applicationType);
    const deadline = Date.now() + gracefulTimeoutMs;
    const stdinStop = shouldUseStdinStop(
      managed.config.applicationType,
      managed.config.stopCommand,
    );

    if (stdinStop) {
      const stopCommand = managed.config.stopCommand?.trim() || DEFAULT_STOP_COMMAND;
      const sentStopCommand = await this.flushStdin(managed, stopCommand);
      if (sentStopCommand) {
        this.closeStdinForShutdown(managed);
      }
    } else if (this.areProcessesAlive(child, pids)) {
      this.sendTerminationSignal(managed);
    }

    let remaining = deadline - Date.now();
    if (remaining > 0) {
      const exited = await this.waitUntilProcessesExit(child, pids, remaining);
      if (exited) {
        return this.completeIntentionalStop(instanceId, managed);
      }
    }

    if (stdinStop && this.areProcessesAlive(child, pids)) {
      this.sendTerminationSignal(managed);
      remaining = deadline - Date.now();
      if (remaining > 0) {
        const exited = await this.waitUntilProcessesExit(child, pids, remaining);
        if (exited) {
          return this.completeIntentionalStop(instanceId, managed);
        }
      }
    }

    if (this.areProcessesAlive(child, pids)) {
      this.killInstancePids(pids, true);
      await this.waitUntilProcessesExit(child, pids, forceTimeoutMs);
    }

    return this.completeIntentionalStop(instanceId, managed);
  }

  private completeIntentionalStop(
    instanceId: string,
    managed: ManagedProcess,
  ): InstanceRuntimeStatus {
    this.finalizeIntentionalStop(instanceId, managed);
    this.detachProcess(instanceId, managed);
    return this.toRuntimeStatus(instanceId, managed);
  }

  private isChildRunning(child: ChildProcess | null): boolean {
    return !!child && child.exitCode === null && child.signalCode === null;
  }

  private publishLogs(instanceId: string, lines: LogLine[]): void {
    if (lines.length > 0) {
      appendPersistedLogs(instanceId, lines, LOG_BUFFER_SIZE);
    }

    const listeners = this.logSubscribers.get(instanceId);
    if (!listeners) {
      return;
    }
    for (const line of lines) {
      for (const listener of listeners) {
        listener(line);
      }
    }
  }

  private createLogBuffer(instanceId: string): LogBuffer {
    const buffer = new LogBuffer(LOG_BUFFER_SIZE);
    const persisted = loadPersistedLogs(instanceId, LOG_BUFFER_SIZE);
    if (persisted.length > 0) {
      buffer.loadLines(persisted);
    }
    return buffer;
  }

  private runExclusive<T>(instanceId: string, task: () => Promise<T>): Promise<T> {
    const previous = this.lifecycleTails.get(instanceId) ?? Promise.resolve();
    const run = previous.catch(() => undefined).then(task);
    this.lifecycleTails.set(
      instanceId,
      run.then(
        () => undefined,
        () => undefined,
      ),
    );
    return run;
  }

  async start(instanceId: string, config: InstanceProcessConfig): Promise<InstanceRuntimeStatus> {
    return this.runExclusive(instanceId, () => this.startInner(instanceId, config));
  }

  private async startInner(
    instanceId: string,
    config: InstanceProcessConfig,
  ): Promise<InstanceRuntimeStatus> {
    const existing = this.processes.get(instanceId);
    if (
      existing &&
      (existing.status === "running" || existing.status === "starting") &&
      !existing.stopping &&
      this.hasAlivePids(instanceId, existing)
    ) {
      return this.toRuntimeStatus(instanceId, existing);
    }

    if (existing && (existing.stopping || this.hasAlivePids(instanceId, existing))) {
      await this.stopInstance(instanceId, false, { background: false });
    }

    if (existing) {
      this.clearRestartTimer(existing);
    }

    if (existing?.taskProcess) {
      this.killTaskProcess(existing);
    }

    const managed: ManagedProcess = existing ?? {
      config,
      process: null,
      taskProcess: null,
      taskTimeout: null,
      status: "starting",
      logBuffer: this.createLogBuffer(instanceId),
      startedAt: null,
      exitCode: null,
      restartAttempts: 0,
      stopping: false,
      intentionalStop: false,
      restartTimer: null,
      windowsJob: null,
    };

    managed.config = config;
    await this.ensureReadyForStart(instanceId, managed);
    managed.status = "starting";
    managed.stopping = false;
    managed.intentionalStop = false;
    managed.exitCode = null;
    this.processes.set(instanceId, managed);
    this.publishStatus(instanceId);

    await this.spawnProcess(instanceId, managed);
    this.publishStatus(instanceId);
    return this.toRuntimeStatus(instanceId, managed);
  }

  async stop(instanceId: string): Promise<InstanceRuntimeStatus> {
    return this.runExclusive(instanceId, () =>
      this.stopInstance(instanceId, false, { background: true }),
    );
  }

  async terminate(instanceId: string): Promise<InstanceRuntimeStatus> {
    return this.runExclusive(instanceId, () => this.stopInstance(instanceId, true));
  }

  private async stopInstance(
    instanceId: string,
    force: boolean,
    options: { background?: boolean } = {},
  ): Promise<InstanceRuntimeStatus> {
    const managed = this.processes.get(instanceId);
    if (!managed) {
      return {
        instanceId,
        status: "stopped",
        pid: null,
        startedAt: null,
        exitCode: null,
        restartAttempts: 0,
      };
    }

    const forceTimeoutMs = getForceStopTimeoutMs(managed.config.applicationType);

    if (managed.stopping || managed.intentionalStop) {
      const child = managed.process;
      const pids = this.collectPids(instanceId, managed);
      if (force) {
        this.killInstancePids(pids, true);
        await this.waitUntilProcessesExit(child, pids, forceTimeoutMs);
        return this.completeIntentionalStop(instanceId, managed);
      }

      return this.toRuntimeStatus(instanceId, managed);
    }

    managed.intentionalStop = true;
    this.clearRestartTimer(managed);

    const child = managed.process;
    const pids = this.collectPids(instanceId, managed);
    const running = this.hasAlivePids(instanceId, managed);

    if (!running) {
      return this.completeIntentionalStop(instanceId, managed);
    }

    if (force) {
      managed.stopping = true;
      managed.status = "stopping";
      this.publishStatus(instanceId);
      this.killInstancePids(pids, true);
      await this.waitUntilProcessesExit(child, pids, forceTimeoutMs);
      return this.completeIntentionalStop(instanceId, managed);
    }

    managed.stopping = true;
    managed.status = "stopping";
    this.publishStatus(instanceId);

    const shutdown = this.gracefulShutdown(instanceId, managed, child, pids);
    if (options.background) {
      void shutdown.catch(() => undefined);
      return this.toRuntimeStatus(instanceId, managed);
    }

    return shutdown;
  }

  async restart(
    instanceId: string,
    config: InstanceProcessConfig,
  ): Promise<InstanceRuntimeStatus> {
    return this.runExclusive(instanceId, async () => {
      await this.stopInstance(instanceId, false, { background: false });
      return this.startInner(instanceId, config);
    });
  }

  async shutdown(): Promise<void> {
    const pids = new Set<number>();

    for (const [instanceId, managed] of this.processes.entries()) {
      managed.stopping = true;
      managed.intentionalStop = true;
      this.clearRestartTimer(managed);
      this.clearTaskTimeout(managed);

      for (const pid of this.collectPids(instanceId, managed)) {
        pids.add(pid);
      }

      if (managed.taskProcess?.pid && isProcessAlive(managed.taskProcess.pid)) {
        pids.add(managed.taskProcess.pid);
      }
    }

    for (const pid of this.pidRegistry.listPids()) {
      pids.add(pid);
    }

    for (const pid of pids) {
      if (isProcessAlive(pid)) {
        killProcess(pid, true, true);
      }
    }

    if (pids.size > 0) {
      await this.waitUntilProcessesExit(null, [...pids], DEFAULT_TERMINATE_TIMEOUT_MS);
    }

    for (const [instanceId, managed] of this.processes.entries()) {
      managed.process = null;
      managed.status = "stopped";
      this.releaseWindowsJob(managed);
      this.pidRegistry.remove(instanceId);
      this.publishStatus(instanceId);
    }

    this.processes.clear();
    this.logSubscribers.clear();
    this.statusSubscribers.clear();
    this.pidRegistry.clear();
  }

  private async spawnProcess(instanceId: string, managed: ManagedProcess): Promise<void> {
    if (managed.process) {
      this.releaseChildResources(managed.process);
      managed.process = null;
    }

    if (!fs.existsSync(managed.config.workingDirectory)) {
      managed.status = "crashed";
      const lines = managed.logBuffer.appendLine(
        "stderr",
        `Working directory does not exist: ${managed.config.workingDirectory}`,
      );
      this.publishLogs(instanceId, lines);
      this.publishStatus(instanceId);
      return;
    }

    try {
      validateStartupCommandFiles(
        managed.config.executablePath,
        managed.config.arguments,
        managed.config.workingDirectory,
      );
    } catch (error) {
      managed.status = "crashed";
      const message =
        error instanceof PathSecurityError
          ? error.message
          : "Startup command references a file that is not available";
      const lines = managed.logBuffer.appendLine("stderr", message);
      this.publishLogs(instanceId, lines);
      this.publishStatus(instanceId);
      return;
    }

    this.releaseWindowsJob(managed);
    managed.windowsJob = createWindowsInstanceJob({
      memoryLimitMb: managed.config.memoryLimitMb,
      cpuLimitPercent: managed.config.cpuLimitPercent,
    });

    const args = parseArguments(managed.config.arguments);
    const child = spawnInstanceProcess(managed.config.executablePath, args, {
      cwd: managed.config.workingDirectory,
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
      env: process.env,
      detached: process.platform !== "win32",
    });

    managed.process = child;
    managed.startedAt = new Date().toISOString();

    child.stdout?.on("data", (chunk: Buffer) => {
      const lines = managed.logBuffer.append("stdout", chunk.toString());
      this.publishLogs(instanceId, lines);
    });

    child.stderr?.on("data", (chunk: Buffer) => {
      const lines = managed.logBuffer.append("stderr", chunk.toString());
      this.publishLogs(instanceId, lines);
    });

    child.on("spawn", () => {
      managed.status = "running";
      if (child.pid) {
        this.pidRegistry.set(instanceId, child.pid, managed.startedAt ?? new Date().toISOString(), managed.config);
        const assigned = managed.windowsJob?.assignPid(child.pid);
        if (assigned === false) {
          console.warn(
            `[stackpatch] Could not assign process ${child.pid} for instance ${instanceId} to Windows instance job`,
          );
        }
      }
      this.publishStatus(instanceId);
    });

    child.on("error", (error) => {
      const lines = managed.logBuffer.appendLine("stderr", `Process error: ${error.message}`);
      this.publishLogs(instanceId, lines);
      managed.status = "crashed";
      managed.exitCode = 1;
      this.detachProcess(instanceId, managed);
      this.publishStatus(instanceId);
      this.scheduleAutoRestart(instanceId, managed);
    });

    child.on("exit", (code) => {
      managed.exitCode = code;
      this.detachProcess(instanceId, managed);

      if (this.wasIntentionallyStopped(managed)) {
        this.finalizeIntentionalStop(instanceId, managed);
        return;
      }

      if (code === 0) {
        managed.status = "stopped";
        this.publishStatus(instanceId);
        return;
      }

      if (isMemoryLimitExitCode(code)) {
        const limitMb = managed.config.memoryLimitMb;
        const limitLabel = limitMb ? `${limitMb} MB` : "configured";
        const lines = managed.logBuffer.appendLine(
          "stderr",
          `Process terminated: exceeded memory limit (${limitLabel}).`,
        );
        this.publishLogs(instanceId, lines);
      }

      managed.status = "crashed";
      this.publishStatus(instanceId);
      this.scheduleAutoRestart(instanceId, managed);
    });
  }

  private wasIntentionallyStopped(managed: ManagedProcess): boolean {
    return managed.intentionalStop || managed.stopping || managed.status === "stopped";
  }

  private finalizeIntentionalStop(instanceId: string, managed: ManagedProcess): void {
    managed.stopping = false;
    managed.intentionalStop = false;
    managed.status = "stopped";
    this.publishStatus(instanceId);
  }

  private scheduleAutoRestart(instanceId: string, managed: ManagedProcess): void {
    if (this.wasIntentionallyStopped(managed)) {
      return;
    }

    if (!managed.config.autoRestart) {
      return;
    }

    if (managed.restartAttempts >= managed.config.maxRestartRetries) {
      const lines = managed.logBuffer.appendLine(
        "stderr",
        `Auto-restart limit reached (${managed.config.maxRestartRetries} attempts).`,
      );
      this.publishLogs(instanceId, lines);
      return;
    }

    const delayMs = Math.min(1000 * 2 ** managed.restartAttempts, 30_000);
    managed.restartAttempts += 1;
    managed.status = "starting";
    this.publishStatus(instanceId);

    managed.restartTimer = setTimeout(() => {
      managed.restartTimer = null;
      if (!this.wasIntentionallyStopped(managed)) {
        void this.spawnProcess(instanceId, managed);
      }
    }, delayMs);
  }

  private clearRestartTimer(managed: ManagedProcess): void {
    if (managed.restartTimer) {
      clearTimeout(managed.restartTimer);
      managed.restartTimer = null;
    }
  }

  private detachProcess(instanceId: string, managed: ManagedProcess): void {
    this.releaseChildResources(managed.process);
    managed.process = null;
    this.releaseWindowsJob(managed);
    this.pidRegistry.remove(instanceId);
    this.flushLogBuffer(instanceId, managed);
  }

  /**
   * Job handle release points — every path that can end a process must call this:
   *   child.on("exit")        → detachProcess
   *   child.on("error")       → detachProcess
   *   intentional stop        → completeIntentionalStop → detachProcess
   *   daemon shutdown         → explicit call per managed instance
   *   re-spawn                → called before creating new job
   *   ensureReadyForStart     → called after waitUntilProcessesExit
   *
   * close() is idempotent — safe to call more than once on the same job.
   */
  private releaseWindowsJob(managed: ManagedProcess): void {
    managed.windowsJob?.close();
    managed.windowsJob = null;
  }

  private flushLogBuffer(instanceId: string, managed: ManagedProcess): void {
    const lines = managed.logBuffer.flushPartial();
    this.publishLogs(instanceId, lines);
  }

  private releaseChildResources(child: ChildProcess | null): void {
    if (!child) {
      return;
    }

    child.removeAllListeners();
    try {
      child.stdin?.destroy();
      child.stdout?.destroy();
      child.stderr?.destroy();
    } catch {
    }
  }

  private hasAlivePids(instanceId: string, managed: ManagedProcess | undefined): boolean {
    if (!managed) {
      return false;
    }

    const child = managed.process;
    return this.collectPids(instanceId, managed).some((pid) => this.isPidAlive(pid, child));
  }

  private async ensureReadyForStart(instanceId: string, managed: ManagedProcess): Promise<void> {
    this.releaseChildResources(managed.process);
    managed.process = null;

    const pids = this.collectPids(instanceId, managed);
    const alive = pids.filter((pid) => isProcessAlive(pid));
    if (alive.length === 0) {
      managed.stopping = false;
      managed.intentionalStop = false;
      return;
    }

    for (const pid of alive) {
      killProcess(pid, true, true);
    }

    await this.waitUntilProcessesExit(null, alive, DEFAULT_TERMINATE_TIMEOUT_MS);
    this.releaseWindowsJob(managed);
    this.pidRegistry.remove(instanceId);
    managed.stopping = false;
    managed.intentionalStop = false;
    managed.status = "stopped";
  }

  private collectPids(instanceId: string, managed: ManagedProcess): number[] {
    const pids = new Set<number>();

    if (managed.process?.pid) {
      pids.add(managed.process.pid);
    }

    const entry = this.pidRegistry.get(instanceId);
    if (entry?.pid && this.isPidAlive(entry.pid, managed.process)) {
      pids.add(entry.pid);
    }

    return [...pids].filter((pid) => pid > 0);
  }

  private resolveActivePid(instanceId: string): number | null {
    const managed = this.processes.get(instanceId);
    const child = managed?.process ?? null;
    const fromProcess = child?.pid ?? null;
    if (fromProcess && this.isPidAlive(fromProcess, child)) {
      return fromProcess;
    }

    const entry = this.pidRegistry.get(instanceId);
    if (entry?.pid && this.isPidAlive(entry.pid, child)) {
      return entry.pid;
    }

    return null;
  }

  private waitUntilProcessesExit(
    child: ChildProcess | null,
    pids: number[],
    timeoutMs: number,
  ): Promise<boolean> {
    const trackedPids = [...new Set(pids.filter((pid) => pid > 0))];

    if (timeoutMs <= 0) {
      return Promise.resolve(!this.areProcessesAlive(child, trackedPids));
    }

    if (!this.areProcessesAlive(child, trackedPids)) {
      return Promise.resolve(true);
    }

    return new Promise((resolve) => {
      let settled = false;

      const finish = (exited: boolean) => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timer);
        clearInterval(poller);
        child?.off("exit", onExit);
        resolve(exited);
      };

      const onExit = () => {
        if (!this.areProcessesAlive(child, trackedPids)) {
          finish(true);
        }
      };

      const timer = setTimeout(() => {
        finish(!this.areProcessesAlive(child, trackedPids));
      }, timeoutMs);

      child?.on("exit", onExit);

      const poller = setInterval(() => {
        if (!this.areProcessesAlive(child, trackedPids)) {
          finish(true);
        }
      }, 100);
    });
  }

  private runOneOffCommand(
    instanceId: string,
    config: InstanceProcessConfig,
    command: string,
  ): { sent: boolean; mode: "task"; error?: string } {
    const trimmed = command.trim();
    if (!trimmed) {
      return { sent: false, mode: "task", error: "Command cannot be empty" };
    }

    if (!fs.existsSync(config.workingDirectory)) {
      return {
        sent: false,
        mode: "task",
        error: `Working directory does not exist: ${config.workingDirectory}`,
      };
    }

    const managed = this.ensureShellState(instanceId, config);
    if (managed.taskProcess && this.isChildRunning(managed.taskProcess)) {
      return { sent: false, mode: "task", error: "A console command is already running" };
    }

    const child = this.spawnShellCommand(trimmed, config.workingDirectory);
    managed.taskProcess = child;

    child.stdout?.on("data", (chunk: Buffer) => {
      const lines = managed.logBuffer.append("stdout", chunk.toString());
      this.publishLogs(instanceId, lines);
    });

    child.stderr?.on("data", (chunk: Buffer) => {
      const lines = managed.logBuffer.append("stderr", chunk.toString());
      this.publishLogs(instanceId, lines);
    });

    child.on("error", (error) => {
      const lines = managed.logBuffer.appendLine("stderr", `Command error: ${error.message}`);
      this.publishLogs(instanceId, lines);
      this.finalizeTask(instanceId, managed, 1);
    });

    child.on("exit", (code) => {
      this.flushLogBuffer(instanceId, managed);
      this.finalizeTask(instanceId, managed, code);
    });

    managed.taskTimeout = setTimeout(() => {
      if (managed.taskProcess && this.isChildRunning(managed.taskProcess)) {
        if (managed.taskProcess.pid) {
          killProcess(managed.taskProcess.pid, true);
        }
      }
    }, DEFAULT_TASK_TIMEOUT_MS);

    return { sent: true, mode: "task" };
  }

  private ensureShellState(instanceId: string, config: InstanceProcessConfig): ManagedProcess {
    const existing = this.processes.get(instanceId);
    if (existing) {
      existing.config = config;
      return existing;
    }

    const managed: ManagedProcess = {
      config,
      process: null,
      taskProcess: null,
      taskTimeout: null,
      status: "stopped",
      logBuffer: this.createLogBuffer(instanceId),
      startedAt: null,
      exitCode: null,
      restartAttempts: 0,
      stopping: false,
      intentionalStop: false,
      restartTimer: null,
      windowsJob: null,
    };
    this.processes.set(instanceId, managed);
    return managed;
  }

  private spawnShellCommand(command: string, workingDirectory: string): ChildProcess {
    if (process.platform === "win32") {
      return spawn("cmd.exe", ["/d", "/s", "/c", command], {
        cwd: workingDirectory,
        stdio: ["ignore", "pipe", "pipe"],
        windowsHide: true,
        env: process.env,
      });
    }

    return spawn("sh", ["-c", command], {
      cwd: workingDirectory,
      stdio: ["ignore", "pipe", "pipe"],
      env: process.env,
    });
  }

  private finalizeTask(
    _instanceId: string,
    managed: ManagedProcess,
    _exitCode: number | null,
  ): void {
    this.clearTaskTimeout(managed);
    managed.taskProcess = null;
  }

  private killTaskProcess(managed: ManagedProcess): void {
    if (!managed.taskProcess) {
      return;
    }

    this.clearTaskTimeout(managed);
    if (managed.taskProcess.pid && isProcessAlive(managed.taskProcess.pid)) {
      killProcess(managed.taskProcess.pid, true);
    }
    managed.taskProcess = null;
  }

  private clearTaskTimeout(managed: ManagedProcess): void {
    if (managed.taskTimeout) {
      clearTimeout(managed.taskTimeout);
      managed.taskTimeout = null;
    }
  }

  private toRuntimeStatus(instanceId: string, managed: ManagedProcess): InstanceRuntimeStatus {
    const pid = this.resolveActivePid(instanceId) ?? managed.process?.pid ?? null;

    return {
      instanceId,
      status: managed.status,
      pid,
      startedAt: managed.startedAt,
      exitCode: managed.exitCode,
      restartAttempts: managed.restartAttempts,
    };
  }
}
