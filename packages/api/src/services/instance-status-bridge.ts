import type { InstanceRuntimeStatus, InstanceStatsEntry } from "@stackpatch/shared";
import { canAccessInstance } from "../auth/permissions.js";
import type { AuthUser } from "../auth/types.js";
import { getDaemonClient, isDaemonError } from "./daemon-client.js";
import { isDaemonConnected } from "./daemon.js";
import { collectInstanceStat } from "./instance-stats.js";
import { applyRuntimeUpdate } from "./instance-sync.js";

interface StatusSocket {
  readyState: number;
  send: (data: string) => void;
}

interface StatusClient {
  socket: StatusSocket;
  user: AuthUser;
}

const OPEN = 1;

class InstanceStatusBridge {
  private clients = new Set<StatusClient>();
  private daemonUnsubscribe: (() => void) | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;

  addClient(socket: StatusSocket, user: AuthUser): void {
    this.clients.add({ socket, user });
    this.ensureDaemonSubscription();
  }

  removeClient(socket: StatusSocket): void {
    this.clients = new Set([...this.clients].filter((client) => client.socket !== socket));
    if (this.clients.size === 0) {
      this.daemonUnsubscribe?.();
      this.daemonUnsubscribe = null;
      if (this.reconnectTimer) {
        clearTimeout(this.reconnectTimer);
        this.reconnectTimer = null;
      }
    }
  }

  private ensureDaemonSubscription(): void {
    if (this.daemonUnsubscribe || this.clients.size === 0 || !isDaemonConnected()) {
      return;
    }

    try {
      this.daemonUnsubscribe = getDaemonClient().subscribeStatus({
        onSnapshot: () => {
          // Snapshot is reconciled when clients connect; live updates drive the UI.
        },
        onUpdate: (runtime) => {
          this.handleRuntimeUpdate(runtime);
        },
        onError: () => {
          this.scheduleReconnect();
        },
      });
    } catch (error) {
      if (!isDaemonError(error)) {
        throw error;
      }
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer || this.clients.size === 0) {
      return;
    }

    this.daemonUnsubscribe?.();
    this.daemonUnsubscribe = null;

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.ensureDaemonSubscription();
    }, 5000);
  }

  private broadcastStats(instanceId: string, stats: InstanceStatsEntry): void {
    const payload = JSON.stringify({ type: "stats", instanceId, stats });

    for (const client of this.clients) {
      if (!canAccessInstance(client.user, instanceId, "viewer")) {
        continue;
      }
      if (client.socket.readyState === OPEN) {
        client.socket.send(payload);
      }
    }
  }

  private handleRuntimeUpdate(runtime: InstanceRuntimeStatus): void {
    const instance = applyRuntimeUpdate(runtime);
    if (!instance) {
      return;
    }

    const payload = JSON.stringify({ type: "update", instance });
    for (const client of this.clients) {
      if (!canAccessInstance(client.user, instance.id, "viewer")) {
        continue;
      }
      if (client.socket.readyState === OPEN) {
        client.socket.send(payload);
      }
    }

    void collectInstanceStat(instance).then((stats) => {
      this.broadcastStats(instance.id, stats);
    });
  }
}

export const instanceStatusBridge = new InstanceStatusBridge();
