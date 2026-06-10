import Fastify from "fastify";
import cors from "@fastify/cors";
import cookie from "@fastify/cookie";
import session from "@fastify/session";
import { APP_NAME } from "@stackpatch/shared";
import { bootstrapAuth } from "./auth/bootstrap.js";
import { requireAuth } from "./auth/middleware.js";
import { SqliteSessionStore } from "./auth/session-store.js";
import "./auth/types.js";
import { config } from "./config.js";
import { closeDatabase, getDatabase } from "./db/database.js";
import { configRoutes } from "./routes/config.js";
import { auditLogRoutes } from "./routes/audit-logs.js";
import { authRoutes } from "./routes/auth.js";
import { healthRoutes } from "./routes/health.js";
import { consoleRoutes } from "./routes/console.js";
import { fileRoutes } from "./routes/files.js";
import { instanceRoutes } from "./routes/instances.js";
import { statusRoutes } from "./routes/status.js";
import { settingsRoutes } from "./routes/settings.js";
import { scheduleRoutes } from "./routes/schedules.js";
import { userRoutes } from "./routes/users.js";
import { registerUi } from "./register-ui.js";
import { initializeRuntimeConfig } from "./runtime-config.js";

async function buildServer() {
  const app = Fastify({ logger: true });

  await app.register(cors, {
    origin: true,
    credentials: true,
  });

  getDatabase();
  const { sessionSecret } = await bootstrapAuth();

  await app.register(cookie);
  await app.register(session, {
    secret: sessionSecret,
    cookieName: "stackpatch.sid",
    store: new SqliteSessionStore(),
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      secure: false,
      maxAge: 7 * 24 * 60 * 60 * 1000,
      path: "/",
    },
    saveUninitialized: false,
  });

  app.addHook("preHandler", requireAuth);

  await app.register(healthRoutes);
  await app.register(authRoutes);
  await app.register(configRoutes);
  await app.register(instanceRoutes);
  await app.register(statusRoutes);
  await app.register(consoleRoutes);
  await app.register(fileRoutes);
  await app.register(userRoutes);
  await app.register(auditLogRoutes);
  await app.register(settingsRoutes);
  await app.register(scheduleRoutes);
  await registerUi(app);

  return app;
}

async function main() {
  getDatabase();
  const { panelPort } = initializeRuntimeConfig();
  const app = await buildServer();

  const shutdown = async () => {
    await app.close();
    closeDatabase();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  await app.listen({ host: config.host, port: panelPort });
  console.log(`[${APP_NAME}] panel ready on http://localhost:${panelPort}`);
  app.log.info(`${APP_NAME} panel listening on http://${config.host}:${panelPort}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
