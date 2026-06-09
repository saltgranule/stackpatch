import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readMinecraftServerProperties, resolveMinecraftServerPort } from "./minecraft-server-ping.js";

describe("minecraft server ping helpers", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "stackpatch-mc-port-"));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("reads server-port and max-players from server.properties", () => {
    fs.writeFileSync(
      path.join(tempDir, "server.properties"),
      "motd=Hello\nserver-port=25570\nmax-players=30\n",
      "utf8",
    );

    expect(readMinecraftServerProperties(tempDir, "java -jar server.jar nogui")).toEqual({
      propertiesPresent: true,
      port: 25570,
      maxPlayers: 30,
    });
    expect(resolveMinecraftServerPort(tempDir, "java -jar server.jar nogui")).toBe(25570);
  });

  it("defaults max players when properties exist without max-players", () => {
    fs.writeFileSync(path.join(tempDir, "server.properties"), "motd=Hello\n", "utf8");

    expect(readMinecraftServerProperties(tempDir, "java -jar server.jar nogui")).toEqual({
      propertiesPresent: true,
      port: 25565,
      maxPlayers: 20,
    });
  });

  it("falls back when server.properties is missing", () => {
    expect(readMinecraftServerProperties(tempDir, "java -jar server.jar nogui")).toEqual({
      propertiesPresent: false,
      port: 25565,
      maxPlayers: null,
    });
  });

  it("reads port from startup command flags", () => {
    expect(resolveMinecraftServerPort(tempDir, "java -jar server.jar --port 25580 nogui")).toBe(
      25580,
    );
  });
});
