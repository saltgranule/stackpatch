import type { FastifyInstance } from "fastify";
import type { UserRole } from "@stackpatch/shared";
import { v4 as uuid } from "uuid";
import { hashPassword } from "../auth/password.js";
import { getRequestUser, requireAdmin } from "../auth/middleware.js";
import { validateRoleChange, validateUserDeletion } from "../auth/user-policy.js";
import { recordAuditEvent } from "../services/audit-log.js";
import { getInstanceById } from "../db/instances.js";
import {
  createUser,
  deleteUser,
  getUserById,
  listUsers,
  removeInstancePermission,
  setInstancePermission,
  updateUser,
} from "../db/users.js";

const GLOBAL_USER_ROLES: UserRole[] = ["admin", "viewer"];
const INSTANCE_PERMISSION_ROLES: UserRole[] = ["viewer"];

interface CreateUserBody {
  username: string;
  password: string;
  role: UserRole;
}

interface UpdateUserBody {
  username?: string;
  password?: string;
  role?: UserRole;
}

interface PermissionBody {
  instanceId: string;
  role: UserRole;
}

export async function userRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", requireAdmin);

  app.get("/api/users", async () => {
    return { users: listUsers() };
  });

  app.post<{ Body: CreateUserBody }>("/api/users", async (request, reply) => {
    const { username, password, role } = request.body;

    if (!username?.trim() || !password || !role) {
      return reply.status(400).send({ error: "username, password, and role are required" });
    }

    if (!GLOBAL_USER_ROLES.includes(role)) {
      return reply.status(400).send({ error: "Role must be admin or viewer" });
    }

    const passwordHash = await hashPassword(password);
    const user = createUser(uuid(), username.trim(), passwordHash, role);
    const currentUser = getRequestUser(request);
    recordAuditEvent(
      currentUser,
      "user.create",
      `${currentUser.username} created user "${user.username}" (${user.role})`,
    );
    return reply.status(201).send({ user });
  });

  app.patch<{ Params: { id: string }; Body: UpdateUserBody }>(
    "/api/users/:id",
    async (request, reply) => {
      const existing = getUserById(request.params.id);
      if (!existing) {
        return reply.status(404).send({ error: "User not found" });
      }

      const currentUser = getRequestUser(request);

      if (request.body.role) {
        if (!GLOBAL_USER_ROLES.includes(request.body.role)) {
          return reply.status(400).send({ error: "Role must be admin or viewer" });
        }

        const roleCheck = validateRoleChange(currentUser, existing, request.body.role);
        if (!roleCheck.allowed) {
          return reply.status(roleCheck.status ?? 400).send({ error: roleCheck.error });
        }
      }

      const passwordHash = request.body.password
        ? await hashPassword(request.body.password)
        : undefined;

      const updated = updateUser(request.params.id, {
        username: request.body.username?.trim(),
        role: request.body.role,
        passwordHash,
      });

      recordAuditEvent(
        currentUser,
        "user.update",
        `${currentUser.username} updated user "${updated!.username}"`,
      );

      return { user: updated };
    },
  );

  app.delete<{ Params: { id: string } }>("/api/users/:id", async (request, reply) => {
    const currentUser = getRequestUser(request);
    const existing = getUserById(request.params.id);
    if (!existing) {
      return reply.status(404).send({ error: "User not found" });
    }

    const policy = validateUserDeletion(currentUser, request.params.id);

    if (!policy.allowed) {
      return reply.status(policy.status ?? 400).send({ error: policy.error });
    }

    deleteUser(request.params.id);
    recordAuditEvent(
      currentUser,
      "user.delete",
      `${currentUser.username} deleted user "${existing.username}"`,
    );
    return { ok: true };
  });

  app.put<{ Params: { id: string }; Body: PermissionBody }>(
    "/api/users/:id/permissions",
    async (request, reply) => {
      const user = getUserById(request.params.id);
      if (!user) {
        return reply.status(404).send({ error: "User not found" });
      }

      if (user.role === "admin") {
        return reply.status(400).send({ error: "Admins have access to all instances" });
      }

      const { instanceId, role } = request.body;
      if (!instanceId || !role) {
        return reply.status(400).send({ error: "instanceId and role are required" });
      }

      if (!INSTANCE_PERMISSION_ROLES.includes(role)) {
        return reply
          .status(400)
          .send({ error: "Instance role must be viewer" });
      }

      if (!getInstanceById(instanceId)) {
        return reply.status(404).send({ error: "Instance not found" });
      }

      const permission = setInstancePermission(uuid(), user.id, instanceId, role);
      const currentUser = getRequestUser(request);
      const instance = getInstanceById(instanceId)!;
      recordAuditEvent(
        currentUser,
        "user.permission.set",
        `${currentUser.username} granted ${user.username} ${role} access to "${instance.name}"`,
        instance,
      );
      return { permission };
    },
  );

  app.delete<{ Params: { id: string }; Querystring: { instanceId: string } }>(
    "/api/users/:id/permissions",
    async (request, reply) => {
      const user = getUserById(request.params.id);
      if (!user) {
        return reply.status(404).send({ error: "User not found" });
      }

      if (!request.query.instanceId) {
        return reply.status(400).send({ error: "instanceId is required" });
      }

      const instance = getInstanceById(request.query.instanceId);
      if (!instance) {
        return reply.status(404).send({ error: "Instance not found" });
      }

      removeInstancePermission(user.id, request.query.instanceId);
      const currentUser = getRequestUser(request);
      recordAuditEvent(
        currentUser,
        "user.permission.remove",
        `${currentUser.username} removed ${user.username}'s access to "${instance.name}"`,
        instance,
      );
      return { ok: true };
    },
  );
}
