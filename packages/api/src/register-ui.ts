import fs from "node:fs";
import path from "node:path";
import type { IncomingMessage, ServerResponse } from "node:http";
import fastifyStatic from "@fastify/static";
import middie from "@fastify/middie";
import { findWorkspaceRoot } from "@stackpatch/shared";
import type { FastifyInstance } from "fastify";
import type { Connect } from "vite";

const isDev = process.env.NODE_ENV !== "production";

function getUiPaths() {
  const workspaceRoot = findWorkspaceRoot();
  const uiRoot = path.join(workspaceRoot, "packages", "ui");
  const uiDist = path.join(uiRoot, "dist");
  return { uiRoot, uiDist };
}

function isReservedPanelPath(url: string | undefined): boolean {
  const pathOnly = (url ?? "").split("?")[0] ?? "";
  return (
    pathOnly === "/healthz" ||
    pathOnly.startsWith("/api") ||
    pathOnly.startsWith("/assets")
  );
}

async function registerProjectAssets(app: FastifyInstance): Promise<void> {
  const workspaceRoot = findWorkspaceRoot();
  const assetsDir = path.join(workspaceRoot, "assets");

  if (!fs.existsSync(assetsDir)) {
    return;
  }

  await app.register(fastifyStatic, {
    root: assetsDir,
    prefix: "/assets/",
    decorateReply: false,
  });
}

function wrapViteMiddleware(
  viteMiddleware: Connect.Server,
): (req: IncomingMessage, res: ServerResponse, next: () => void) => void {
  return (req, res, next) => {
    if (isReservedPanelPath(req.url)) {
      next();
      return;
    }
    viteMiddleware(req, res, next);
  };
}

export async function registerUi(app: FastifyInstance): Promise<void> {
  const { uiRoot, uiDist } = getUiPaths();

  await registerProjectAssets(app);

  if (isDev) {
    const { createServer: createViteServer } = await import("vite");
    await app.register(middie);
    const vite = await createViteServer({
      root: uiRoot,
      configFile: path.join(uiRoot, "vite.config.ts"),
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(wrapViteMiddleware(vite.middlewares));
    return;
  }

  if (!fs.existsSync(path.join(uiDist, "index.html"))) {
    app.log.warn("UI build not found. Run pnpm --filter @stackpatch/ui build before starting.");
    return;
  }

  await app.register(fastifyStatic, {
    root: uiDist,
    wildcard: false,
  });

  app.setNotFoundHandler(async (request, reply) => {
    const url = request.url.split("?")[0] ?? request.url;
    if (url.startsWith("/api") || url === "/healthz") {
      return reply.status(404).send({ error: "Not found" });
    }

    return reply.sendFile("index.html", uiDist);
  });
}
