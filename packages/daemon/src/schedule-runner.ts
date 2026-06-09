import type { InstanceSchedule } from "@stackpatch/shared";
import { formatScheduleAction, isIntervalDue } from "@stackpatch/shared";
import type { ProcessManager } from "./process-manager.js";
import { createScheduleBackup } from "./schedule-backup.js";
import {
  insertSystemAuditLog,
  loadEnabledSchedules,
  loadInstanceProcessConfig,
  loadInstanceStatus,
} from "./schedule-store.js";

const TICK_INTERVAL_MS = 60_000;

export class ScheduleRunner {
  private timer: NodeJS.Timeout | null = null;
  private readonly lastFiredAt = new Map<string, Date>();

  constructor(private readonly processManager: ProcessManager) {}

  start(): void {
    if (this.timer) {
      return;
    }

    this.timer = setInterval(() => {
      void this.tick();
    }, TICK_INTERVAL_MS);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private async tick(): Promise<void> {
    const now = new Date();
    let schedules: InstanceSchedule[];

    try {
      schedules = loadEnabledSchedules();
    } catch (error) {
      console.error("[stackpatch] failed to load schedules:", error);
      return;
    }

    for (const schedule of schedules) {
      const lastFired = this.lastFiredAt.get(schedule.id) ?? null;
      const anchor = new Date(schedule.createdAt);
      if (!isIntervalDue(schedule.intervalValue, schedule.intervalUnit, now, lastFired, anchor)) {
        continue;
      }

      this.lastFiredAt.set(schedule.id, now);
      await this.dispatch(schedule);
    }
  }

  private async dispatch(schedule: InstanceSchedule): Promise<void> {
    const instance = loadInstanceProcessConfig(schedule.instanceId);
    if (!instance) {
      insertSystemAuditLog(
        "schedule.failed",
        `Schedule ${schedule.id} failed: instance not found`,
        schedule.instanceId,
        null,
      );
      return;
    }

    const { config, name } = instance;
    const status = this.processManager.getRuntimeStatus(schedule.instanceId)[0]?.status
      ?? loadInstanceStatus(schedule.instanceId);
    const actionLabel = formatScheduleAction(schedule.action);

    try {
      switch (schedule.action) {
        case "start": {
          if (status === "running" || status === "starting") {
            insertSystemAuditLog(
              "schedule.skipped",
              `Skipped ${actionLabel} schedule for "${name}" (already ${status})`,
              schedule.instanceId,
              name,
            );
            return;
          }
          await this.processManager.start(schedule.instanceId, config);
          break;
        }
        case "stop": {
          if (status === "stopped" || status === "stopping") {
            insertSystemAuditLog(
              "schedule.skipped",
              `Skipped ${actionLabel} schedule for "${name}" (already ${status})`,
              schedule.instanceId,
              name,
            );
            return;
          }
          await this.processManager.stop(schedule.instanceId);
          break;
        }
        case "restart": {
          await this.processManager.restart(schedule.instanceId, config);
          break;
        }
        case "run_command": {
          if (!schedule.command?.trim()) {
            throw new Error("Schedule command is empty");
          }
          if (status !== "running") {
            insertSystemAuditLog(
              "schedule.skipped",
              `Skipped ${actionLabel} schedule for "${name}" (instance not running)`,
              schedule.instanceId,
              name,
            );
            return;
          }
          const result = this.processManager.sendConsoleInput(
            schedule.instanceId,
            schedule.command,
            config,
          );
          if (!result.sent) {
            throw new Error(result.error ?? "Failed to send command");
          }
          break;
        }
        case "backup": {
          const archivePath = createScheduleBackup(config.workingDirectory);
          this.processManager.appendSystemLog(
            schedule.instanceId,
            `[schedule] Backup created: ${archivePath}`,
            "stdout",
          );
          break;
        }
      }

      insertSystemAuditLog(
        "schedule.fired",
        `${actionLabel} schedule ran for "${name}"`,
        schedule.instanceId,
        name,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "Schedule dispatch failed";
      insertSystemAuditLog(
        "schedule.failed",
        `${actionLabel} schedule failed for "${name}": ${message}`,
        schedule.instanceId,
        name,
      );
      this.processManager.appendSystemLog(
        schedule.instanceId,
        `[schedule] ${actionLabel} failed: ${message}`,
        "stderr",
      );
    }
  }
}
