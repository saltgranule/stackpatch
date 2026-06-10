import { afterEach, describe, expect, it, vi } from "vitest";
import {
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
