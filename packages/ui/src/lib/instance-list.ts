import type { Instance } from "@stackpatch/shared";

export type InstanceListFilter =
  | "all"
  | "running"
  | "stopped"
  | "recently_started"
  | "recently_crashed";

export const INSTANCE_LIST_FILTER_OPTIONS = [
  { value: "all", label: "All" },
  { value: "running", label: "Running" },
  { value: "stopped", label: "Stopped" },
  { value: "recently_started", label: "Recently started" },
  { value: "recently_crashed", label: "Recently crashed" },
] as const satisfies readonly { value: InstanceListFilter; label: string }[];

const RECENT_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

function parseTimestamp(value: string | null): number | null {
  if (!value) {
    return null;
  }

  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : null;
}

export function filterInstances(instances: Instance[], filter: InstanceListFilter): Instance[] {
  const cutoff = Date.now() - RECENT_WINDOW_MS;

  switch (filter) {
    case "running":
      return instances.filter((instance) => instance.status === "running");
    case "stopped":
      return instances.filter((instance) => instance.status === "stopped");
    case "recently_started":
      return instances
        .filter((instance) => {
          const startedAt = parseTimestamp(instance.lastStartedAt);
          return startedAt !== null && startedAt >= cutoff;
        })
        .sort((left, right) => {
          const rightTime = parseTimestamp(right.lastStartedAt) ?? 0;
          const leftTime = parseTimestamp(left.lastStartedAt) ?? 0;
          return rightTime - leftTime;
        });
    case "recently_crashed":
      return instances
        .filter((instance) => {
          const updatedAt = parseTimestamp(instance.updatedAt);
          return instance.status === "crashed" && updatedAt !== null && updatedAt >= cutoff;
        })
        .sort((left, right) => {
          const rightTime = parseTimestamp(right.updatedAt) ?? 0;
          const leftTime = parseTimestamp(left.updatedAt) ?? 0;
          return rightTime - leftTime;
        });
    default:
      return instances;
  }
}

export function searchInstances(instances: Instance[], query: string): Instance[] {
  const trimmed = query.trim().toLowerCase();
  if (!trimmed) {
    return instances;
  }

  return instances.filter(
    (instance) =>
      instance.name.toLowerCase().includes(trimmed) ||
      instance.workingDirectory.toLowerCase().includes(trimmed),
  );
}

export function filterAndSearchInstances(
  instances: Instance[],
  filter: InstanceListFilter,
  query: string,
): Instance[] {
  return searchInstances(filterInstances(instances, filter), query);
}
