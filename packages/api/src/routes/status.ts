import type { FastifyInstance } from "fastify";
import websocket from "@fastify/websocket";
import { getRequestUser } from "../auth/middleware.js";
import { listInstancesForUser } from "../lib/instance-access.js";
import { collectInstanceStats } from "../services/instance-stats.js";
import { instanceStatusBridge } from "../services/instance-status-bridge.js";
import { syncAllInstances } from "../services/instance-sync.js";

export async function statusRoutes(app: FastifyInstance): Promise<void> {
  await app.register(websocket);

  app.get("/api/instances/status/ws", { websocket: true }, (socket, request) => {
    let user;
    try {
      user = getRequestUser(request);
    } catch {
      socket.close(1008, "Authentication required");
      return;
    }

    instanceStatusBridge.addClient(socket, user);

    void (async () => {
      await syncAllInstances();
      if (socket.readyState !== 1) {
        return;
      }
      const instances = listInstancesForUser(user);
      const stats = await collectInstanceStats(instances);
      socket.send(
        JSON.stringify({
          type: "snapshot",
          instances,
          stats,
        }),
      );
    })().catch(() => {
      if (socket.readyState === 1) {
        socket.close(1011, "Failed to sync instance status");
      }
    });

    socket.on("close", () => {
      instanceStatusBridge.removeClient(socket);
    });
  });
}
