import path from "node:path";
import { spawn, type ChildProcess, type SpawnOptions } from "node:child_process";

const WINDOWS_SCRIPT_EXTENSIONS = new Set([".bat", ".cmd"]);

/** Env vars that nudge common CLIs to emit ANSI when stdout is a pipe. */
export function buildConsoleSpawnEnv(
  baseEnv: NodeJS.ProcessEnv = process.env,
): NodeJS.ProcessEnv {
  return {
    ...baseEnv,
    FORCE_COLOR: "1",
    TERM: "xterm-256color",
  };
}

export function isWindowsScriptExecutable(executablePath: string): boolean {
  return (
    process.platform === "win32" &&
    WINDOWS_SCRIPT_EXTENSIONS.has(path.extname(executablePath).toLowerCase())
  );
}

export function buildInstanceSpawnArgs(
  executablePath: string,
  args: string[],
): { command: string; args: string[] } {
  if (isWindowsScriptExecutable(executablePath)) {
    return {
      command: "cmd.exe",
      args: ["/d", "/s", "/c", executablePath, ...args],
    };
  }

  return { command: executablePath, args };
}

export function spawnInstanceProcess(
  executablePath: string,
  args: string[],
  options: SpawnOptions,
): ChildProcess {
  const target = buildInstanceSpawnArgs(executablePath, args);
  return spawn(target.command, target.args, {
    ...options,
    env: buildConsoleSpawnEnv(options.env ?? process.env),
  });
}
