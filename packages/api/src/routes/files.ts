import fs from "node:fs";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import type { FastifyInstance, FastifyReply } from "fastify";
import multipart from "@fastify/multipart";
import { MAX_MAX_UPLOAD_FILE_SIZE_MB } from "@stackpatch/shared";
import { requireInstanceAccess, getRequestUser } from "../auth/middleware.js";
import { getInstanceById } from "../db/instances.js";
import { getSystemSettings } from "../db/settings.js";
import {
  archiveInstancePaths,
  unzipInstanceFile,
} from "../lib/instance-archive.js";
import {
  createInstanceEntry,
  getDirectorySize,
  listDirectory,
  readEditableFile,
  renameInstanceEntry,
  resolveInstanceFilePath,
  sanitizeFileName,
  toRelativeFilePath,
  writeEditableFile,
} from "../lib/instance-files.js";
import { isPathSecurityError } from "../lib/instance-paths.js";
import { createUploadSizeLimitStream, UploadSizeLimitError } from "../lib/upload-size-limit.js";
import { recordAuditEvent } from "../services/audit-log.js";

interface DeleteFilesBody {
  paths: string[];
}

interface SaveFileBody {
  path: string;
  content: string;
}

interface ArchiveFilesBody {
  paths: string[];
  directoryPath?: string;
  outputName?: string;
}

interface UnzipFileBody {
  path: string;
}

interface CreateFileBody {
  parentPath?: string;
  name: string;
  type: "file" | "directory";
}

interface RenameFileBody {
  path: string;
  newName: string;
}

function handleFileError(reply: FastifyReply, error: unknown) {
  if (error instanceof UploadSizeLimitError) {
    const maxUploadFileSizeMb = getSystemSettings().maxUploadFileSizeMb;
    return reply.status(413).send({
      error: `File exceeds the maximum upload size of ${maxUploadFileSizeMb} MB`,
    });
  }
  if (isPathSecurityError(error)) {
    return reply.status(400).send({ error: error.message });
  }
  throw error;
}

export async function fileRoutes(app: FastifyInstance): Promise<void> {
  await app.register(multipart, {
    limits: {
      fileSize: MAX_MAX_UPLOAD_FILE_SIZE_MB * 1024 * 1024,
      files: 32,
    },
  });

  app.get<{ Params: { id: string } }>(
    "/api/instances/:id/files/size",
    async (request, reply) => {
      await requireInstanceAccess(request, reply, request.params.id, "viewer");
      if (reply.sent) return;

      const instance = getInstanceById(request.params.id);
      if (!instance) {
        return reply.status(404).send({ error: "Instance not found" });
      }

      try {
        return { totalBytes: getDirectorySize(instance.workingDirectory) };
      } catch (error) {
        return handleFileError(reply, error);
      }
    },
  );

  app.get<{ Params: { id: string }; Querystring: { path?: string } }>(
    "/api/instances/:id/files",
    async (request, reply) => {
      await requireInstanceAccess(request, reply, request.params.id, "viewer");
      if (reply.sent) return;

      const instance = getInstanceById(request.params.id);
      if (!instance) {
        return reply.status(404).send({ error: "Instance not found" });
      }

      try {
        const relativePath = request.query.path ?? "";
        const entries = listDirectory(instance.workingDirectory, relativePath);
        return {
          path: relativePath.replace(/\\/g, "/"),
          entries,
        };
      } catch (error) {
        return handleFileError(reply, error);
      }
    },
  );

  app.get<{ Params: { id: string }; Querystring: { path: string } }>(
    "/api/instances/:id/files/download",
    async (request, reply) => {
      await requireInstanceAccess(request, reply, request.params.id, "viewer");
      if (reply.sent) return;

      const instance = getInstanceById(request.params.id);
      if (!instance) {
        return reply.status(404).send({ error: "Instance not found" });
      }

      if (!request.query.path?.trim()) {
        return reply.status(400).send({ error: "path is required" });
      }

      try {
        const filePath = resolveInstanceFilePath(instance.workingDirectory, request.query.path);
        if (!fs.existsSync(filePath)) {
          return reply.status(404).send({ error: "File not found" });
        }

        const stat = fs.statSync(filePath);
        if (!stat.isFile()) {
          return reply.status(400).send({ error: "Path is not a file" });
        }

        const fileName = path.basename(filePath);
        return reply
          .header("Content-Type", "application/octet-stream")
          .header("Content-Disposition", `attachment; filename="${fileName}"`)
          .send(fs.createReadStream(filePath));
      } catch (error) {
        return handleFileError(reply, error);
      }
    },
  );

  app.post<{ Params: { id: string } }>(
    "/api/instances/:id/files/upload",
    async (request, reply) => {
      await requireInstanceAccess(request, reply, request.params.id, "admin");
      if (reply.sent) return;

      const instance = getInstanceById(request.params.id);
      if (!instance) {
        return reply.status(404).send({ error: "Instance not found" });
      }

      try {
        let relativeDir = "";
        const uploaded: string[] = [];
        const maxUploadBytes = getSystemSettings().maxUploadFileSizeMb * 1024 * 1024;
        const parts = request.parts();

        for await (const part of parts) {
          if (part.type === "field") {
            if (part.fieldname === "path") {
              relativeDir = String(part.value);
            }
            continue;
          }

          const fileName = sanitizeFileName(part.filename);
          const directoryPath = resolveInstanceFilePath(instance.workingDirectory, relativeDir);
          const directoryStat = fs.existsSync(directoryPath) ? fs.statSync(directoryPath) : null;

          if (!directoryStat?.isDirectory()) {
            return reply.status(400).send({ error: "Upload directory does not exist" });
          }

          const normalizedDir = relativeDir.replace(/\\/g, "/").replace(/\/$/, "");
          const relativeFilePath = normalizedDir ? `${normalizedDir}/${fileName}` : fileName;
          const destination = resolveInstanceFilePath(instance.workingDirectory, relativeFilePath);

          try {
            await pipeline(
              part.file,
              createUploadSizeLimitStream(maxUploadBytes),
              fs.createWriteStream(destination),
            );
          } catch (uploadError) {
            if (fs.existsSync(destination)) {
              fs.unlinkSync(destination);
            }
            throw uploadError;
          }

          uploaded.push(toRelativeFilePath(instance.workingDirectory, destination));
        }

        if (uploaded.length === 0) {
          return reply.status(400).send({ error: "No files uploaded" });
        }

        const user = getRequestUser(request);
        recordAuditEvent(
          user,
          "file.upload",
          `${user.username} uploaded ${uploaded.length} file(s) to "${instance.name}"`,
          instance,
        );

        return reply.status(201).send({ uploaded });
      } catch (error) {
        return handleFileError(reply, error);
      }
    },
  );

  app.get<{ Params: { id: string }; Querystring: { path: string } }>(
    "/api/instances/:id/files/content",
    async (request, reply) => {
      await requireInstanceAccess(request, reply, request.params.id, "viewer");
      if (reply.sent) return;

      const instance = getInstanceById(request.params.id);
      if (!instance) {
        return reply.status(404).send({ error: "Instance not found" });
      }

      if (!request.query.path?.trim()) {
        return reply.status(400).send({ error: "path is required" });
      }

      try {
        return readEditableFile(instance.workingDirectory, request.query.path);
      } catch (error) {
        return handleFileError(reply, error);
      }
    },
  );

  app.put<{ Params: { id: string }; Body: SaveFileBody }>(
    "/api/instances/:id/files/content",
    async (request, reply) => {
      await requireInstanceAccess(request, reply, request.params.id, "admin");
      if (reply.sent) return;

      const instance = getInstanceById(request.params.id);
      if (!instance) {
        return reply.status(404).send({ error: "Instance not found" });
      }

      const { path: filePath, content } = request.body ?? {};
      if (!filePath?.trim() || content === undefined) {
        return reply.status(400).send({ error: "path and content are required" });
      }

      try {
        const saved = writeEditableFile(instance.workingDirectory, filePath, content);
        const user = getRequestUser(request);
        recordAuditEvent(
          user,
          "file.save",
          `${user.username} saved "${filePath}" in "${instance.name}"`,
          instance,
        );
        return saved;
      } catch (error) {
        return handleFileError(reply, error);
      }
    },
  );

  app.post<{ Params: { id: string }; Body: ArchiveFilesBody }>(
    "/api/instances/:id/files/archive",
    async (request, reply) => {
      await requireInstanceAccess(request, reply, request.params.id, "admin");
      if (reply.sent) return;

      const instance = getInstanceById(request.params.id);
      if (!instance) {
        return reply.status(404).send({ error: "Instance not found" });
      }

      const paths = request.body?.paths;
      if (!Array.isArray(paths) || paths.length === 0) {
        return reply.status(400).send({ error: "paths array is required" });
      }

      try {
        const archived = archiveInstancePaths(
          instance.workingDirectory,
          paths,
          request.body?.directoryPath ?? "",
          request.body?.outputName,
        );
        const user = getRequestUser(request);
        recordAuditEvent(
          user,
          "file.archive",
          `${user.username} archived ${paths.length} item(s) in "${instance.name}"`,
          instance,
        );
        return archived;
      } catch (error) {
        return handleFileError(reply, error);
      }
    },
  );

  app.post<{ Params: { id: string }; Body: UnzipFileBody }>(
    "/api/instances/:id/files/unzip",
    async (request, reply) => {
      await requireInstanceAccess(request, reply, request.params.id, "admin");
      if (reply.sent) return;

      const instance = getInstanceById(request.params.id);
      if (!instance) {
        return reply.status(404).send({ error: "Instance not found" });
      }

      const filePath = request.body?.path?.trim();
      if (!filePath) {
        return reply.status(400).send({ error: "path is required" });
      }

      try {
        const extracted = unzipInstanceFile(instance.workingDirectory, filePath);
        const user = getRequestUser(request);
        recordAuditEvent(
          user,
          "file.unzip",
          `${user.username} extracted "${filePath}" in "${instance.name}"`,
          instance,
        );
        return extracted;
      } catch (error) {
        return handleFileError(reply, error);
      }
    },
  );

  app.post<{ Params: { id: string }; Body: CreateFileBody }>(
    "/api/instances/:id/files/create",
    async (request, reply) => {
      await requireInstanceAccess(request, reply, request.params.id, "admin");
      if (reply.sent) return;

      const instance = getInstanceById(request.params.id);
      if (!instance) {
        return reply.status(404).send({ error: "Instance not found" });
      }

      const { name, type } = request.body ?? {};
      if (!name?.trim() || (type !== "file" && type !== "directory")) {
        return reply.status(400).send({ error: "name and type are required" });
      }

      try {
        const created = createInstanceEntry(
          instance.workingDirectory,
          request.body?.parentPath ?? "",
          name,
          type,
        );
        const user = getRequestUser(request);
        recordAuditEvent(
          user,
          "file.create",
          `${user.username} created ${type} "${created.path}" in "${instance.name}"`,
          instance,
        );
        return reply.status(201).send(created);
      } catch (error) {
        return handleFileError(reply, error);
      }
    },
  );

  app.post<{ Params: { id: string }; Body: RenameFileBody }>(
    "/api/instances/:id/files/rename",
    async (request, reply) => {
      await requireInstanceAccess(request, reply, request.params.id, "admin");
      if (reply.sent) return;

      const instance = getInstanceById(request.params.id);
      if (!instance) {
        return reply.status(404).send({ error: "Instance not found" });
      }

      const { path: entryPath, newName } = request.body ?? {};
      if (!entryPath?.trim() || !newName?.trim()) {
        return reply.status(400).send({ error: "path and newName are required" });
      }

      try {
        const renamed = renameInstanceEntry(instance.workingDirectory, entryPath, newName);
        const user = getRequestUser(request);
        recordAuditEvent(
          user,
          "file.rename",
          `${user.username} renamed "${entryPath}" to "${renamed.path}" in "${instance.name}"`,
          instance,
        );
        return renamed;
      } catch (error) {
        return handleFileError(reply, error);
      }
    },
  );

  app.delete<{ Params: { id: string }; Body: DeleteFilesBody }>(
    "/api/instances/:id/files",
    async (request, reply) => {
      await requireInstanceAccess(request, reply, request.params.id, "admin");
      if (reply.sent) return;

      const instance = getInstanceById(request.params.id);
      if (!instance) {
        return reply.status(404).send({ error: "Instance not found" });
      }

      const paths = request.body?.paths;
      if (!Array.isArray(paths) || paths.length === 0) {
        return reply.status(400).send({ error: "paths array is required" });
      }

      try {
        const deleted: string[] = [];

        for (const entryPath of paths) {
          const absolutePath = resolveInstanceFilePath(instance.workingDirectory, entryPath);
          if (!fs.existsSync(absolutePath)) {
            continue;
          }

          const stat = fs.statSync(absolutePath);
          if (stat.isDirectory()) {
            fs.rmSync(absolutePath, { recursive: true, force: true });
          } else {
            fs.unlinkSync(absolutePath);
          }

          deleted.push(entryPath.replace(/\\/g, "/"));
        }

        const user = getRequestUser(request);
        recordAuditEvent(
          user,
          "file.delete",
          `${user.username} deleted ${deleted.length} item(s) from "${instance.name}"`,
          instance,
        );

        return { deleted };
      } catch (error) {
        return handleFileError(reply, error);
      }
    },
  );
}
