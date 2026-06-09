import type { FastifyInstance } from "fastify";
import { getAuthUserById, getUserByUsername, recordUserLogin, updateUser } from "../db/users.js";
import { recordAuditEvent } from "../services/audit-log.js";
import { verifyPassword } from "../auth/password.js";

interface LoginBody {
  username: string;
  password: string;
}

export async function authRoutes(app: FastifyInstance): Promise<void> {
  app.post<{ Body: LoginBody }>("/api/auth/login", async (request, reply) => {
    const { username, password } = request.body;

    if (!username?.trim() || !password) {
      return reply.status(400).send({ error: "username and password are required" });
    }

    const user = getUserByUsername(username.trim());
    if (!user || !(await verifyPassword(password, user.passwordHash))) {
      return reply.status(401).send({ error: "Invalid username or password" });
    }

    recordUserLogin(user.id);

    request.session.userId = user.id;
    await new Promise<void>((resolve, reject) => {
      request.session.save((error) => (error ? reject(error) : resolve()));
    });

    const authUser = getAuthUserById(user.id);
    recordAuditEvent(authUser, "auth.login", `${user.username} logged in`);
    return { user: authUser };
  });

  app.post("/api/auth/logout", async (request, reply) => {
    const userId = request.session.userId;
    const authUser = userId ? getAuthUserById(userId) : null;
    if (authUser) {
      recordAuditEvent(authUser, "auth.logout", `${authUser.username} logged out`);
    }
    await new Promise<void>((resolve) => {
      request.session.destroy(() => resolve());
    });
    return reply.send({ ok: true });
  });

  app.get("/api/auth/me", async (request, reply) => {
    const userId = request.session.userId;
    if (!userId) {
      return reply.status(401).send({ error: "Authentication required" });
    }

    const user = getAuthUserById(userId);
    if (!user) {
      return reply.status(401).send({ error: "Authentication required" });
    }

    return { user };
  });

  app.patch<{ Body: { theme?: string } }>("/api/auth/me", async (request, reply) => {
    const userId = request.session.userId;
    if (!userId) {
      return reply.status(401).send({ error: "Authentication required" });
    }

    const theme = request.body.theme;
    if (theme !== "light" && theme !== "dark" && theme !== "system") {
      return reply.status(400).send({ error: "Invalid theme" });
    }

    const updated = updateUser(userId, { theme });
    return { user: getAuthUserById(updated!.id) };
  });
}
