import type { FastifyInstance } from "fastify";
import { APP_VERSION, type HealthResponse } from "@stackpatch/shared";
import { isDaemonResponsive } from "../services/daemon.js";
import { getActiveDaemonPort, getActivePanelPort } from "../runtime-config.js";

export async function healthRoutes(app: FastifyInstance): Promise<void> {
  app.get("/healthz", async (): Promise<HealthResponse> => {
    const daemonConnected = await isDaemonResponsive();
    return {
      status: "ok",
      version: APP_VERSION,
      daemon: daemonConnected ? "connected" : "disconnected",
      panelPort: getActivePanelPort(),
      daemonPort: getActiveDaemonPort(),
    };
  });
}
