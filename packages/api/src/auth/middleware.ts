import type { FastifyReply, FastifyRequest } from "fastify";
import type { UserRole } from "@stackpatch/shared";
import { getAuthUserById } from "../db/users.js";
import { canAccessInstance } from "./permissions.js";
import type { AuthUser } from "./types.js";

const PUBLIC_ROUTES = new Set(["/healthz", "/api/auth/login"]);

export function isPublicRoute(url: string): boolean {
  const path = url.split("?")[0] ?? url;
  return PUBLIC_ROUTES.has(path);
}

function isApiRoute(url: string): boolean {
  const path = url.split("?")[0] ?? url;
  return path.startsWith("/api");
}

export async function requireAuth(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const path = request.url.split("?")[0] ?? request.url;
  if (path === "/healthz" || !isApiRoute(request.url)) {
    return;
  }

  if (isPublicRoute(path)) {
    return;
  }

  const userId = request.session.userId;
  if (!userId) {
    await reply.status(401).send({ error: "Authentication required" });
    return;
  }

  const user = getAuthUserById(userId);
  if (!user) {
    request.session.destroy(() => undefined);
    await reply.status(401).send({ error: "Authentication required" });
    return;
  }

  request.user = user;
}

export function getRequestUser(request: FastifyRequest): AuthUser {
  if (!request.user) {
    throw new Error("Authenticated user missing on request");
  }
  return request.user;
}

export async function requireAdmin(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const user = getRequestUser(request);
  if (user.role !== "admin") {
    await reply.status(403).send({ error: "Admin access required" });
  }
}

export async function requireInstanceAccess(
  request: FastifyRequest,
  reply: FastifyReply,
  instanceId: string,
  minimumRole: UserRole,
): Promise<void> {
  const user = getRequestUser(request);
  if (!canAccessInstance(user, instanceId, minimumRole)) {
    await reply.status(403).send({ error: "Insufficient permissions for this instance" });
  }
}

declare module "fastify" {
  interface FastifyRequest {
    user?: AuthUser;
  }
}
