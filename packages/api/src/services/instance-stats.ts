import type { Instance, InstanceStatsEntry, InstanceStatsMap } from "@stackpatch/shared";
import {
  pingMinecraftServer,
  readMinecraftServerProperties,
} from "../lib/minecraft-server-ping.js";

const MINECRAFT_HOST = "127.0.0.1";

function emptyMinecraftStats(
  propertiesPresent: boolean,
  maxPlayers: number | null,
): NonNullable<InstanceStatsEntry["minecraft"]> {
  return {
    playerCount: null,
    maxPlayers,
    propertiesPresent,
    reachable: false,
  };
}

export async function collectInstanceStat(instance: Instance): Promise<InstanceStatsEntry> {
  const entry: InstanceStatsEntry = {
    instanceId: instance.id,
    applicationType: instance.applicationType,
  };

  if (instance.applicationType !== "minecraft") {
    return entry;
  }

  const properties = readMinecraftServerProperties(
    instance.workingDirectory,
    instance.startupCommand,
  );

  if (instance.status !== "running" || !properties.propertiesPresent) {
    entry.minecraft = emptyMinecraftStats(properties.propertiesPresent, properties.maxPlayers);
    return entry;
  }

  const status = await pingMinecraftServer(MINECRAFT_HOST, properties.port);

  if (!status) {
    entry.minecraft = emptyMinecraftStats(true, properties.maxPlayers);
    return entry;
  }

  entry.minecraft = {
    playerCount: status.online,
    maxPlayers: properties.maxPlayers,
    propertiesPresent: true,
    reachable: true,
  };

  return entry;
}

export async function collectInstanceStats(instances: Instance[]): Promise<InstanceStatsMap> {
  const entries = await Promise.all(instances.map((instance) => collectInstanceStat(instance)));
  return Object.fromEntries(entries.map((entry) => [entry.instanceId, entry]));
}
