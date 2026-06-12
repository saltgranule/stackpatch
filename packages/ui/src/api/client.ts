import type {
  ApplicationType,
  AuditLogEntry,
  AuthUser,
  FileContentResult,
  HealthResponse,
  Instance,
  InstanceSchedule,
  ListFilesResult,
  LogLine,
  ScheduleAction,
  ScheduleIntervalUnit,
  SystemSettingsStatus,
  UserWithPermissions,
} from "@stackpatch/shared";
import { extractApiErrorMessage } from "../lib/api-error.js";

const fetchOptions: RequestInit = { credentials: "include" };

export interface PathDefaults {
  dataDir: string;
  instancesRoot: string;
  description?: string;
  suggestedWorkingDirectory?: string;
}

export interface CreateInstanceInput {
  name: string;
  applicationType?: ApplicationType;
  startupCommand: string;
  workingDirectory?: string;
  memoryLimitMb?: number | null;
  cpuLimitPercent?: number | null;
  autoRestart?: boolean;
  maxRestartRetries?: number;
  stopCommand?: string;
}

export interface UpdateInstanceInput {
  name?: string;
  applicationType?: ApplicationType;
  startupCommand?: string;
  workingDirectory?: string;
  memoryLimitMb?: number | null;
  cpuLimitPercent?: number | null;
  autoRestart?: boolean;
  maxRestartRetries?: number;
  stopCommand?: string;
}

function formatFetchError(error: unknown): Error {
  if (error instanceof TypeError) {
    return new Error(
      "Cannot reach the panel. Make sure stackpatch is running and open http://127.0.0.1:23333",
    );
  }
  return error instanceof Error ? error : new Error("Request failed");
}

async function parseJson<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const contentType = response.headers.get("content-type") ?? "";
    let body: { error?: string; message?: string; statusCode?: number } | null = null;
    let fallbackText = "";

    if (contentType.includes("application/json")) {
      body = (await response.json().catch(() => null)) as {
        error?: string;
        message?: string;
        statusCode?: number;
      } | null;
    } else {
      fallbackText = await response.text().catch(() => "");
    }

    throw new Error(extractApiErrorMessage(body, response.status, fallbackText));
  }
  return response.json() as Promise<T>;
}

async function apiFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  try {
    return await globalThis.fetch(input, init);
  } catch (error) {
    throw formatFetchError(error);
  }
}

export async function fetchHealth(): Promise<HealthResponse> {
  const response = await apiFetch("/healthz", fetchOptions);
  return parseJson<HealthResponse>(response);
}

export async function login(username: string, password: string): Promise<AuthUser> {
  const response = await apiFetch("/api/auth/login", {
    ...fetchOptions,
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  const data = await parseJson<{ user: AuthUser }>(response);
  return data.user;
}

export async function logout(): Promise<void> {
  await apiFetch("/api/auth/logout", { ...fetchOptions, method: "POST" });
}

export async function fetchCurrentUser(): Promise<AuthUser> {
  const response = await apiFetch("/api/auth/me", fetchOptions);
  const data = await parseJson<{ user: AuthUser }>(response);
  return data.user;
}

export async function fetchAuditLogs(limit?: number): Promise<{ entries: AuditLogEntry[] }> {
  const query = limit ? `?limit=${encodeURIComponent(String(limit))}` : "";
  const response = await apiFetch(`/api/audit-logs${query}`, fetchOptions);
  return parseJson<{ entries: AuditLogEntry[] }>(response);
}

export function getAuditLogDownloadUrl(): string {
  return "/api/audit-logs/download";
}

export async function downloadAuthenticatedFile(url: string, filename: string): Promise<void> {
  const response = await apiFetch(url, fetchOptions);
  if (!response.ok) {
    let message = "Download failed";
    try {
      const data = (await response.json()) as { error?: string };
      if (data.error) {
        message = data.error;
      }
    } catch {
    }
    throw new Error(message);
  }

  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(objectUrl);
}

export async function fetchPathDefaults(): Promise<PathDefaults> {
  const response = await apiFetch("/api/config/paths", fetchOptions);
  return parseJson<PathDefaults>(response);
}

export async function fetchSuggestedWorkingDirectory(name: string): Promise<PathDefaults> {
  const response = await apiFetch(
    `/api/config/paths/suggest?name=${encodeURIComponent(name)}`,
    fetchOptions,
  );
  return parseJson<PathDefaults>(response);
}

export async function fetchInstances(): Promise<Instance[]> {
  const response = await apiFetch("/api/instances", fetchOptions);
  const data = await parseJson<{ instances: Instance[] }>(response);
  return data.instances;
}

export async function syncInstances(): Promise<Instance[]> {
  const response = await apiFetch("/api/instances/sync", fetchOptions);
  const data = await parseJson<{ instances: Instance[] }>(response);
  return data.instances;
}

export function getInstanceStatusWsUrl(): string {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${window.location.host}/api/instances/status/ws`;
}

export async function fetchInstance(id: string): Promise<Instance> {
  const response = await apiFetch(`/api/instances/${id}`, fetchOptions);
  const data = await parseJson<{ instance: Instance }>(response);
  return data.instance;
}

export async function createInstance(input: CreateInstanceInput): Promise<Instance> {
  const response = await apiFetch("/api/instances", {
    ...fetchOptions,
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const data = await parseJson<{ instance: Instance }>(response);
  return data.instance;
}

export async function deleteInstance(id: string): Promise<void> {
  const response = await apiFetch(`/api/instances/${id}`, {
    ...fetchOptions,
    method: "DELETE",
  });
  await parseJson<{ ok: boolean }>(response);
}

export async function cloneInstance(id: string, name: string): Promise<Instance> {
  const response = await apiFetch(`/api/instances/${id}/clone`, {
    ...fetchOptions,
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
  const data = await parseJson<{ instance: Instance }>(response);
  return data.instance;
}

export async function updateInstance(
  id: string,
  input: UpdateInstanceInput,
): Promise<Instance> {
  const response = await apiFetch(`/api/instances/${id}`, {
    ...fetchOptions,
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const data = await parseJson<{ instance: Instance }>(response);
  return data.instance;
}

export interface CreateScheduleInput {
  action: ScheduleAction;
  intervalValue: number;
  intervalUnit: ScheduleIntervalUnit;
  enabled?: boolean;
  command?: string;
}

export interface UpdateScheduleInput {
  action?: ScheduleAction;
  intervalValue?: number;
  intervalUnit?: ScheduleIntervalUnit;
  enabled?: boolean;
  command?: string;
}

export async function fetchInstanceSchedules(
  instanceId: string,
): Promise<{ schedules: InstanceSchedule[] }> {
  const response = await apiFetch(`/api/instances/${instanceId}/schedules`, fetchOptions);
  return parseJson<{ schedules: InstanceSchedule[] }>(response);
}

export async function createInstanceSchedule(
  instanceId: string,
  input: CreateScheduleInput,
): Promise<InstanceSchedule> {
  const response = await apiFetch(`/api/instances/${instanceId}/schedules`, {
    ...fetchOptions,
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const data = await parseJson<{ schedule: InstanceSchedule }>(response);
  return data.schedule;
}

export async function updateInstanceSchedule(
  instanceId: string,
  scheduleId: string,
  input: UpdateScheduleInput,
): Promise<InstanceSchedule> {
  const response = await apiFetch(`/api/instances/${instanceId}/schedules/${scheduleId}`, {
    ...fetchOptions,
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const data = await parseJson<{ schedule: InstanceSchedule }>(response);
  return data.schedule;
}

export async function deleteInstanceSchedule(
  instanceId: string,
  scheduleId: string,
): Promise<void> {
  const response = await apiFetch(`/api/instances/${instanceId}/schedules/${scheduleId}`, {
    ...fetchOptions,
    method: "DELETE",
  });
  await parseJson<{ ok: boolean }>(response);
}

export async function startInstance(id: string): Promise<Instance> {
  const response = await apiFetch(`/api/instances/${id}/start`, {
    ...fetchOptions,
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  });
  const data = await parseJson<{ instance: Instance }>(response);
  return data.instance;
}

export async function stopInstance(id: string): Promise<Instance> {
  const response = await apiFetch(`/api/instances/${id}/stop`, {
    ...fetchOptions,
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  });
  const data = await parseJson<{ instance: Instance }>(response);
  return data.instance;
}

export async function terminateInstance(id: string): Promise<Instance> {
  const response = await apiFetch(`/api/instances/${id}/terminate`, {
    ...fetchOptions,
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  });
  const data = await parseJson<{ instance: Instance }>(response);
  return data.instance;
}

export async function restartInstance(id: string): Promise<Instance> {
  const response = await apiFetch(`/api/instances/${id}/restart`, {
    ...fetchOptions,
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  });
  const data = await parseJson<{ instance: Instance }>(response);
  return data.instance;
}

export async function fetchInstanceLogs(id: string): Promise<LogLine[]> {
  const response = await apiFetch(`/api/instances/${id}/logs`, fetchOptions);
  const data = await parseJson<{ lines: LogLine[] }>(response);
  return data.lines;
}

export async function logToInstanceConsole(id: string, message: string): Promise<void> {
  try {
    await apiFetch(`/api/instances/${id}/console/log`, {
      ...fetchOptions,
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message }),
    });
  } catch {
  }
}

export async function fetchUsers(): Promise<UserWithPermissions[]> {
  const response = await apiFetch("/api/users", fetchOptions);
  const data = await parseJson<{ users: UserWithPermissions[] }>(response);
  return data.users;
}

export async function createUser(input: {
  username: string;
  password: string;
  role: AuthUser["role"];
}): Promise<UserWithPermissions> {
  const response = await apiFetch("/api/users", {
    ...fetchOptions,
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const data = await parseJson<{ user: UserWithPermissions }>(response);
  return data.user;
}

export async function updateUser(
  id: string,
  input: { password?: string; role?: AuthUser["role"]; username?: string },
): Promise<UserWithPermissions> {
  const response = await apiFetch(`/api/users/${id}`, {
    ...fetchOptions,
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const data = await parseJson<{ user: UserWithPermissions }>(response);
  return data.user;
}

export async function deleteUser(id: string): Promise<void> {
  const response = await apiFetch(`/api/users/${id}`, { ...fetchOptions, method: "DELETE" });
  await parseJson<{ ok: boolean }>(response);
}

export async function setUserInstancePermission(
  userId: string,
  instanceId: string,
  role: "viewer",
): Promise<void> {
  const response = await apiFetch(`/api/users/${userId}/permissions`, {
    ...fetchOptions,
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ instanceId, role }),
  });
  await parseJson(response);
}

export async function removeUserInstancePermission(
  userId: string,
  instanceId: string,
): Promise<void> {
  const response = await apiFetch(
    `/api/users/${userId}/permissions?instanceId=${encodeURIComponent(instanceId)}`,
    { ...fetchOptions, method: "DELETE" },
  );
  await parseJson<{ ok: boolean }>(response);
}

export function getConsoleLogDownloadUrl(instanceId: string): string {
  return `/api/instances/${instanceId}/logs/download`;
}

export async function fetchUploadConfig(): Promise<{ maxUploadFileSizeMb: number }> {
  const response = await apiFetch("/api/config/uploads", fetchOptions);
  return parseJson<{ maxUploadFileSizeMb: number }>(response);
}

export async function fetchSystemSettings(): Promise<SystemSettingsStatus> {
  const response = await apiFetch("/api/settings", fetchOptions);
  return parseJson<SystemSettingsStatus>(response);
}

export async function updateSystemSettings(input: {
  panelPort?: number;
  daemonPort?: number;
  maxUploadFileSizeMb?: number;
}): Promise<SystemSettingsStatus> {
  const response = await apiFetch("/api/settings", {
    ...fetchOptions,
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  return parseJson<SystemSettingsStatus>(response);
}

export async function listInstanceFiles(
  instanceId: string,
  path = "",
): Promise<ListFilesResult> {
  const query = path ? `?path=${encodeURIComponent(path)}` : "";
  const response = await apiFetch(`/api/instances/${instanceId}/files${query}`, fetchOptions);
  return parseJson<ListFilesResult>(response);
}

export function getInstanceFileDownloadUrl(instanceId: string, filePath: string): string {
  return `/api/instances/${instanceId}/files/download?path=${encodeURIComponent(filePath)}`;
}

export async function uploadInstanceFiles(
  instanceId: string,
  directoryPath: string,
  files: File[] | FileList,
  onProgress?: (percent: number) => void,
): Promise<string[]> {
  const formData = new FormData();
  formData.append("path", directoryPath);
  for (const file of files) {
    formData.append("file", file, file.name);
  }

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `/api/instances/${instanceId}/files/upload`);
    xhr.withCredentials = true;

    xhr.upload.onprogress = (event) => {
      if (!onProgress || !event.lengthComputable || event.total <= 0) {
        return;
      }
      onProgress(Math.min(100, Math.round((event.loaded / event.total) * 100)));
    };

    xhr.onload = () => {
      const contentType = xhr.getResponseHeader("content-type") ?? "";
      const rawBody = xhr.responseText;

      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const data = JSON.parse(rawBody) as { uploaded: string[] };
          resolve(data.uploaded);
        } catch {
          reject(new Error("Upload failed"));
        }
        return;
      }

      let body: { error?: string; message?: string; statusCode?: number } | null = null;
      if (contentType.includes("application/json") && rawBody) {
        try {
          body = JSON.parse(rawBody) as { error?: string; message?: string; statusCode?: number };
        } catch {
          body = null;
        }
      }

      reject(new Error(extractApiErrorMessage(body, xhr.status, rawBody)));
    };

    xhr.onerror = () => {
      reject(new Error("Upload failed"));
    };

    xhr.onabort = () => {
      reject(new Error("Upload cancelled"));
    };

    xhr.send(formData);
  });
}

export async function fetchInstanceFileContent(
  instanceId: string,
  filePath: string,
): Promise<FileContentResult> {
  const response = await apiFetch(
    `/api/instances/${instanceId}/files/content?path=${encodeURIComponent(filePath)}`,
    fetchOptions,
  );
  return parseJson<FileContentResult>(response);
}

export async function saveInstanceFileContent(
  instanceId: string,
  filePath: string,
  content: string,
): Promise<{ path: string; size: number }> {
  const response = await apiFetch(`/api/instances/${instanceId}/files/content`, {
    ...fetchOptions,
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path: filePath, content }),
  });
  return parseJson<{ path: string; size: number }>(response);
}

export async function deleteInstanceFiles(
  instanceId: string,
  paths: string[],
): Promise<string[]> {
  const response = await apiFetch(`/api/instances/${instanceId}/files`, {
    ...fetchOptions,
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ paths }),
  });
  const data = await parseJson<{ deleted: string[] }>(response);
  return data.deleted;
}

export async function archiveInstanceFiles(
  instanceId: string,
  paths: string[],
  directoryPath: string,
): Promise<{ archivePath: string; archived: string[] }> {
  const response = await apiFetch(`/api/instances/${instanceId}/files/archive`, {
    ...fetchOptions,
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ paths, directoryPath }),
  });
  return parseJson<{ archivePath: string; archived: string[] }>(response);
}

export async function unzipInstanceFile(
  instanceId: string,
  filePath: string,
): Promise<{ extractedTo: string; entries: number }> {
  const response = await apiFetch(`/api/instances/${instanceId}/files/unzip`, {
    ...fetchOptions,
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path: filePath }),
  });
  return parseJson<{ extractedTo: string; entries: number }>(response);
}

export async function createInstanceEntry(
  instanceId: string,
  parentPath: string,
  name: string,
  type: "file" | "directory",
): Promise<{ path: string; name: string; type: "file" | "directory" }> {
  const response = await apiFetch(`/api/instances/${instanceId}/files/create`, {
    ...fetchOptions,
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ parentPath, name, type }),
  });
  return parseJson<{ path: string; name: string; type: "file" | "directory" }>(response);
}

export async function renameInstanceEntry(
  instanceId: string,
  entryPath: string,
  newName: string,
): Promise<{ path: string; name: string }> {
  const response = await apiFetch(`/api/instances/${instanceId}/files/rename`, {
    ...fetchOptions,
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path: entryPath, newName }),
  });
  return parseJson<{ path: string; name: string }>(response);
}
