export type ApplicationType =
  | "python"
  | "nodejs"
  | "java"
  | "generic"
  | "minecraft:vanilla"
  | "minecraft:paper"
  | "minecraft:folia"
  | "minecraft:fabric"
  | "minecraft:forge"
  | "minecraft:neoforge"
  | "minecraft:purpur"
  | "minecraft:bungeecord"
  | "minecraft:velocity";

export const APPLICATION_TYPES: ApplicationType[] = [
  "minecraft:paper",
  "minecraft:vanilla",
  "minecraft:fabric",
  "minecraft:forge",
  "minecraft:neoforge",
  "minecraft:folia",
  "minecraft:purpur",
  "minecraft:bungeecord",
  "minecraft:velocity",
  "python",
  "nodejs",
  "java",
  "generic",
];

const LEGACY_APPLICATION_TYPE_MAP: Record<string, ApplicationType> = {
  javascript: "nodejs",
  go: "generic",
  minecraft: "minecraft:paper",
};

export interface ApplicationTypeDefinition {
  label: string;
  defaultStartupCommand: string;
  startupPlaceholder: string;
  defaultStopCommand: string;
  usesStdinStop: boolean;
  /** Max time to wait after the type-specific stop signal before escalating. */
  gracefulStopTimeoutMs: number;
  /** Max time to wait after SIGKILL before giving up. */
  forceStopTimeoutMs: number;
}

export const APPLICATION_TYPE_DEFINITIONS: Record<ApplicationType, ApplicationTypeDefinition> = {
  "minecraft:vanilla": {
    label: "Minecraft: Vanilla",
    defaultStartupCommand: "java -Xmx2G -jar server.jar nogui",
    startupPlaceholder: "java -Xmx2G -jar server.jar nogui",
    defaultStopCommand: "stop",
    usesStdinStop: true,
    gracefulStopTimeoutMs: 30_000,
    forceStopTimeoutMs: 3_000,
  },
  "minecraft:paper": {
    label: "Minecraft: Paper",
    defaultStartupCommand: "java -Xmx2G -jar paper.jar nogui",
    startupPlaceholder: "java -Xmx2G -jar paper.jar nogui",
    defaultStopCommand: "stop",
    usesStdinStop: true,
    gracefulStopTimeoutMs: 30_000,
    forceStopTimeoutMs: 3_000,
  },
  "minecraft:fabric": {
    label: "Minecraft: Fabric",
    defaultStartupCommand: "java -Xmx2G -jar fabric.jar nogui",
    startupPlaceholder: "java -Xmx2G -jar fabric.jar nogui",
    defaultStopCommand: "stop",
    usesStdinStop: true,
    gracefulStopTimeoutMs: 30_000,
    forceStopTimeoutMs: 3_000,
  },
  "minecraft:forge": {
    label: "Minecraft: Forge",
    defaultStartupCommand: "run.bat",
    startupPlaceholder: "run.bat",
    defaultStopCommand: "stop",
    usesStdinStop: true,
    gracefulStopTimeoutMs: 90_000,
    forceStopTimeoutMs: 3_000,
  },
  "minecraft:neoforge": {
    label: "Minecraft: NeoForge",
    defaultStartupCommand: "run.bat",
    startupPlaceholder: "run.bat",
    defaultStopCommand: "stop",
    usesStdinStop: true,
    gracefulStopTimeoutMs: 90_000,
    forceStopTimeoutMs: 3_000,
  },
  "minecraft:folia": {
    label: "Minecraft: Folia",
    defaultStartupCommand: "java -Xmx2G -jar folia.jar nogui",
    startupPlaceholder: "java -Xmx2G -jar folia.jar nogui",
    defaultStopCommand: "stop",
    usesStdinStop: true,
    gracefulStopTimeoutMs: 30_000,
    forceStopTimeoutMs: 3_000,
  },
  "minecraft:purpur": {
    label: "Minecraft: Purpur",
    defaultStartupCommand: "java -Xmx2G -jar purpur.jar nogui",
    startupPlaceholder: "java -Xmx2G -jar purpur.jar nogui",
    defaultStopCommand: "stop",
    usesStdinStop: true,
    gracefulStopTimeoutMs: 30_000,
    forceStopTimeoutMs: 3_000,
  },
  "minecraft:bungeecord": {
    label: "Minecraft: BungeeCord",
    defaultStartupCommand: "java -Xmx512M -jar bungeecord.jar",
    startupPlaceholder: "java -Xmx512M -jar bungeecord.jar",
    defaultStopCommand: "end",
    usesStdinStop: true,
    gracefulStopTimeoutMs: 15_000,
    forceStopTimeoutMs: 3_000,
  },
  "minecraft:velocity": {
    label: "Minecraft: Velocity",
    defaultStartupCommand: "java -Xmx512M -jar velocity.jar",
    startupPlaceholder: "java -Xmx512M -jar velocity.jar",
    defaultStopCommand: "shutdown",
    usesStdinStop: true,
    gracefulStopTimeoutMs: 15_000,
    forceStopTimeoutMs: 3_000,
  },
  python: {
    label: "Python",
    defaultStartupCommand: "python main.py",
    startupPlaceholder: "python main.py",
    defaultStopCommand: "",
    usesStdinStop: false,
    gracefulStopTimeoutMs: 2_000,
    forceStopTimeoutMs: 1_000,
  },
  nodejs: {
    label: "Node.js",
    defaultStartupCommand: "node index.js",
    startupPlaceholder: "node index.js",
    defaultStopCommand: "",
    usesStdinStop: false,
    gracefulStopTimeoutMs: 2_000,
    forceStopTimeoutMs: 1_000,
  },
  java: {
    label: "Java",
    defaultStartupCommand: "java -jar app.jar",
    startupPlaceholder: "java -jar app.jar",
    defaultStopCommand: "",
    usesStdinStop: false,
    gracefulStopTimeoutMs: 5_000,
    forceStopTimeoutMs: 2_000,
  },
  generic: {
    label: "Generic Console Application",
    defaultStartupCommand: "",
    startupPlaceholder: "./my-app --flag",
    defaultStopCommand: "",
    usesStdinStop: false,
    gracefulStopTimeoutMs: 5_000,
    forceStopTimeoutMs: 2_000,
  },
};

export const DEFAULT_APPLICATION_TYPE: ApplicationType = "minecraft:paper";

export function isApplicationType(value: string): value is ApplicationType {
  return APPLICATION_TYPES.includes(value as ApplicationType);
}

export function isMinecraftApplicationType(type: ApplicationType | string): boolean {
  return type.startsWith("minecraft:");
}

export function normalizeApplicationType(value: string): ApplicationType {
  if (isApplicationType(value)) {
    return value;
  }

  return LEGACY_APPLICATION_TYPE_MAP[value] ?? DEFAULT_APPLICATION_TYPE;
}

export function getApplicationTypeDefinition(type: ApplicationType): ApplicationTypeDefinition {
  return APPLICATION_TYPE_DEFINITIONS[type];
}

export function usesStdinStop(type: ApplicationType): boolean {
  return APPLICATION_TYPE_DEFINITIONS[type].usesStdinStop;
}

export function supportsOptionalStdinStop(type: ApplicationType): boolean {
  return type === "generic";
}

export function shouldUseStdinStop(type: ApplicationType, stopCommand: string | undefined): boolean {
  if (usesStdinStop(type)) {
    return true;
  }
  if (supportsOptionalStdinStop(type)) {
    return Boolean(stopCommand?.trim());
  }
  return false;
}

export function getGracefulStopTimeoutMs(type: ApplicationType): number {
  return APPLICATION_TYPE_DEFINITIONS[type].gracefulStopTimeoutMs;
}

export function getForceStopTimeoutMs(type: ApplicationType): number {
  return APPLICATION_TYPE_DEFINITIONS[type].forceStopTimeoutMs;
}

export function formatApplicationType(type: ApplicationType): string {
  return APPLICATION_TYPE_DEFINITIONS[type].label;
}

export interface RuntimeInstallDefinition {
  title: string;
  hint: string;
  command: string;
}

export interface RuntimeResourceLink {
  title: string;
  hint: string;
  url: string;
}

/** Temurin JDK 25 — recommended runtime for modern Minecraft servers. */
export const MINECRAFT_JAVA_SDK_URL = "https://adoptium.net/temurin/releases/?version=25";

export function getJavaRuntimeResource(type: ApplicationType): RuntimeResourceLink | null {
  if (type !== "java" && !isMinecraftApplicationType(type)) {
    return null;
  }

  return {
    title: "Download Java SDK 25",
    hint: "Modern Minecraft needs a recent Java runtime. Open Temurin JDK 25 and choose your platform.",
    url: MINECRAFT_JAVA_SDK_URL,
  };
}

export function getRuntimeInstallDefinition(
  type: ApplicationType,
): RuntimeInstallDefinition | null {
  switch (type) {
    case "python":
      return {
        title: "Install Python",
        hint: "Install the Python runtime on this machine using winget.",
        command:
          "winget install Python.Python.3.12 --accept-package-agreements --accept-source-agreements",
      };
    case "nodejs":
      return {
        title: "Install Node.js",
        hint: "Install the Node.js runtime on this machine using winget.",
        command:
          "winget install OpenJS.NodeJS.LTS --accept-package-agreements --accept-source-agreements",
      };
    default:
      return null;
  }
}

/** Upper bound for daemon IPC stop requests (minecraft world-save shutdown). */
export function getMaxStopRequestTimeoutMs(): number {
  let max = 0;
  for (const type of APPLICATION_TYPES) {
    const definition = APPLICATION_TYPE_DEFINITIONS[type];
    max = Math.max(
      max,
      definition.gracefulStopTimeoutMs + definition.forceStopTimeoutMs,
    );
  }
  return max + 5_000;
}

export function applicationTypeCheckConstraintSql(): string {
  return APPLICATION_TYPES.map((type) => `'${type}'`).join(", ");
}
