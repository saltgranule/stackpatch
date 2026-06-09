import type { ApplicationType } from "./application-types.js";

export interface MinecraftApplicationStats {
  playerCount: number | null;
  maxPlayers: number | null;
  propertiesPresent: boolean;
  reachable: boolean;
}

export interface InstanceStatsEntry {
  instanceId: string;
  applicationType: ApplicationType;
  minecraft?: MinecraftApplicationStats;
}

export type InstanceStatsMap = Record<string, InstanceStatsEntry>;

export function formatMinecraftPlayers(stats: MinecraftApplicationStats | undefined): string | null {
  if (!stats?.propertiesPresent || !stats.reachable) {
    return null;
  }
  if (stats.playerCount === null || stats.maxPlayers === null) {
    return null;
  }
  return `${stats.playerCount} / ${stats.maxPlayers}`;
}

export function shouldShowMinecraftPlayers(
  instanceStatus: string,
  stats: MinecraftApplicationStats | undefined,
): boolean {
  return instanceStatus === "running" && formatMinecraftPlayers(stats) !== null;
}
