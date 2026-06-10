import { describe, expect, it } from "vitest";
import {
  DEFAULT_APPLICATION_TYPE,
  MINECRAFT_JAVA_SDK_URL,
  getJavaRuntimeResource,
  isMinecraftApplicationType,
  normalizeApplicationType,
} from "./application-types.js";

describe("normalizeApplicationType", () => {
  it("maps legacy types to the new catalog", () => {
    expect(normalizeApplicationType("javascript")).toBe("nodejs");
    expect(normalizeApplicationType("go")).toBe("generic");
    expect(normalizeApplicationType("minecraft")).toBe("minecraft:paper");
  });

  it("passes through current types", () => {
    expect(normalizeApplicationType("minecraft:neoforge")).toBe("minecraft:neoforge");
    expect(normalizeApplicationType("python")).toBe("python");
  });

  it("falls back to the default for unknown values", () => {
    expect(normalizeApplicationType("unknown")).toBe(DEFAULT_APPLICATION_TYPE);
  });
});

describe("getJavaRuntimeResource", () => {
  it("returns Temurin JDK 25 link for minecraft and java types", () => {
    const resource = getJavaRuntimeResource("minecraft:paper");
    expect(resource?.url).toBe(MINECRAFT_JAVA_SDK_URL);
    expect(resource?.title).toContain("Java SDK 25");
    expect(getJavaRuntimeResource("java")).not.toBeNull();
    expect(getJavaRuntimeResource("python")).toBeNull();
  });
});

describe("isMinecraftApplicationType", () => {
  it("matches minecraft-prefixed types only", () => {
    expect(isMinecraftApplicationType("minecraft:paper")).toBe(true);
    expect(isMinecraftApplicationType("minecraft:velocity")).toBe(true);
    expect(isMinecraftApplicationType("java")).toBe(false);
    expect(isMinecraftApplicationType("generic")).toBe(false);
  });
});
