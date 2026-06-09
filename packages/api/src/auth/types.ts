import type { AuthUser, ThemePreference } from "@stackpatch/shared";

export type { AuthUser };

declare module "fastify" {
  interface Session {
    userId?: string;
  }
}

declare module "@fastify/session" {
  interface FastifySessionObject {
    userId?: string;
    theme?: ThemePreference;
  }
}
