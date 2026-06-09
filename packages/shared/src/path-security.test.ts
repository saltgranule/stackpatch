import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  PathSecurityError,
  resolveExecutablePath,
  resolveWorkingDirectory,
  slugifyInstanceName,
} from "./path-security.js";

describe("path-security", () => {
  const instancesRoot = path.join("C:", "stackpatch", ".data", "instances");

  it("slugifies instance names", () => {
    expect(slugifyInstanceName("Minecraft Server!")).toBe("minecraft-server");
  });

  it("resolves relative paths inside instances root", () => {
    const resolved = resolveWorkingDirectory("minecraft", instancesRoot);
    expect(resolved).toBe(path.join(instancesRoot, "minecraft"));
  });

  it("rejects traversal in working directory input", () => {
    expect(() => resolveWorkingDirectory("../secrets", instancesRoot)).toThrow(PathSecurityError);
  });

  it("rejects relative escape attempts", () => {
    expect(() => resolveWorkingDirectory("..\\windows", instancesRoot)).toThrow(PathSecurityError);
  });

  it("allows absolute paths outside instances root", () => {
    const resolved = resolveWorkingDirectory("D:\\games\\valheim", instancesRoot);
    expect(resolved).toBe(path.resolve("D:\\games\\valheim"));
  });

  it("requires absolute executable paths", () => {
    expect(() => resolveExecutablePath("java")).toThrow(PathSecurityError);
    expect(resolveExecutablePath("C:\\java\\bin\\java.exe")).toBe(
      path.resolve("C:\\java\\bin\\java.exe"),
    );
  });
});
