import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildConsoleSpawnEnv,
  buildInstanceSpawnArgs,
  isWindowsScriptExecutable,
} from "./spawn-instance-process.js";

describe("isWindowsScriptExecutable", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns true for .bat and .cmd on Windows", () => {
    vi.stubGlobal("process", { ...process, platform: "win32" });
    expect(isWindowsScriptExecutable(String.raw`C:\server\run.bat`)).toBe(true);
    expect(isWindowsScriptExecutable(String.raw`C:\server\run.cmd`)).toBe(true);
  });

  it("returns false for other executables and non-Windows platforms", () => {
    vi.stubGlobal("process", { ...process, platform: "win32" });
    expect(isWindowsScriptExecutable(String.raw`C:\server\java.exe`)).toBe(false);

    vi.stubGlobal("process", { ...process, platform: "linux" });
    expect(isWindowsScriptExecutable("/server/run.bat")).toBe(false);
  });
});

describe("buildConsoleSpawnEnv", () => {
  it("sets color-friendly env vars on top of the base environment", () => {
    expect(buildConsoleSpawnEnv({ PATH: "/bin", CUSTOM: "1" })).toEqual({
      PATH: "/bin",
      CUSTOM: "1",
      FORCE_COLOR: "1",
      TERM: "xterm-256color",
    });
  });

  it("overrides existing FORCE_COLOR and TERM values", () => {
    expect(
      buildConsoleSpawnEnv({ FORCE_COLOR: "0", TERM: "dumb", PATH: "/bin" }),
    ).toEqual({
      PATH: "/bin",
      FORCE_COLOR: "1",
      TERM: "xterm-256color",
    });
  });
});

describe("buildInstanceSpawnArgs", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("routes Windows batch files through cmd.exe", () => {
    vi.stubGlobal("process", { ...process, platform: "win32" });
    expect(buildInstanceSpawnArgs(String.raw`C:\server\run.bat`, ["nogui"])).toEqual({
      command: "cmd.exe",
      args: ["/d", "/s", "/c", String.raw`C:\server\run.bat`, "nogui"],
    });
  });

  it("keeps direct spawn for normal executables", () => {
    vi.stubGlobal("process", { ...process, platform: "win32" });
    expect(buildInstanceSpawnArgs("java", ["-jar", "server.jar"])).toEqual({
      command: "java",
      args: ["-jar", "server.jar"],
    });
  });
});
