import type { FastifyInstance } from "fastify";
import { getPathDefaults, suggestWorkingDirectory } from "../lib/instance-paths.js";

export async function configRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/config/paths", async () => {
    const defaults = getPathDefaults();
    return {
      ...defaults,
      description:
        "Instance files default to .data/instances/<name>. Relative paths stay inside that folder. Absolute paths are allowed but must already exist.",
    };
  });

  app.get<{ Querystring: { name?: string } }>(
    "/api/config/paths/suggest",
    async (request) => {
      const defaults = getPathDefaults();
      const name = request.query.name ?? "";
      return {
        ...defaults,
        suggestedWorkingDirectory: suggestWorkingDirectory(name),
      };
    },
  );
}
