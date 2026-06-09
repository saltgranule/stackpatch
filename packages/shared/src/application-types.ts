export type ApplicationType = "python" | "javascript" | "go" | "minecraft" | "generic";

export const APPLICATION_TYPES: ApplicationType[] = [
  "python",
  "javascript",
  "go",
  "minecraft",
  "generic",
];

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
  python: {
    label: "Python",
    defaultStartupCommand: "python main.py",
    startupPlaceholder: "python main.py",
    defaultStopCommand: "",
    usesStdinStop: false,
    gracefulStopTimeoutMs: 2_000,
    forceStopTimeoutMs: 1_000,
  },
  javascript: {
    label: "JavaScript",
    defaultStartupCommand: "node index.js",
    startupPlaceholder: "node index.js",
    defaultStopCommand: "",
    usesStdinStop: false,
    gracefulStopTimeoutMs: 2_000,
    forceStopTimeoutMs: 1_000,
  },
  go: {
    label: "Go",
    defaultStartupCommand: "go run .",
    startupPlaceholder: "go run .",
    defaultStopCommand: "",
    usesStdinStop: false,
    gracefulStopTimeoutMs: 2_000,
    forceStopTimeoutMs: 1_000,
  },
  minecraft: {
    label: "Minecraft Server",
    defaultStartupCommand: "java -jar server.jar nogui",
    startupPlaceholder: "java -jar server.jar nogui",
    defaultStopCommand: "stop",
    usesStdinStop: true,
    gracefulStopTimeoutMs: 90_000,
    forceStopTimeoutMs: 3_000,
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

export const DEFAULT_APPLICATION_TYPE: ApplicationType = "minecraft";

export function isApplicationType(value: string): value is ApplicationType {
  return APPLICATION_TYPES.includes(value as ApplicationType);
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
    case "go":
      return {
        title: "Install Go",
        hint: "Install the Go toolchain on this machine using winget.",
        command: "winget install GoLang.Go --accept-package-agreements --accept-source-agreements",
      };
    case "minecraft":
      return {
        title: "Install Java",
        hint: "Install the Java runtime required for this Minecraft server.",
        command:
          "winget install EclipseAdoptium.Temurin.21.JRE --accept-package-agreements --accept-source-agreements",
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
