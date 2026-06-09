import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import type { Instance } from "@stackpatch/shared";
import { parseArguments } from "@stackpatch/shared";

const DEFAULT_MINECRAFT_PORT = 25565;
const DEFAULT_MINECRAFT_MAX_PLAYERS = 20;
const DEFAULT_TIMEOUT_MS = 3_000;

export interface MinecraftServerProperties {
  propertiesPresent: boolean;
  port: number;
  maxPlayers: number | null;
}

function parsePropertiesLine(line: string): { key: string; value: string } | null {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) {
    return null;
  }

  const separatorIndex = trimmed.indexOf("=");
  if (separatorIndex === -1) {
    return null;
  }

  return {
    key: trimmed.slice(0, separatorIndex),
    value: trimmed.slice(separatorIndex + 1),
  };
}

function parsePositiveInt(value: string): number | null {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    return null;
  }
  return parsed;
}

function resolveMinecraftServerPortFromSources(
  startupCommand: string,
  propertiesContent: string | null,
): number {
  if (propertiesContent) {
    for (const line of propertiesContent.split(/\r?\n/)) {
      const parsed = parsePropertiesLine(line);
      if (!parsed || parsed.key !== "server-port") {
        continue;
      }

      const port = Number(parsed.value);
      if (Number.isInteger(port) && port >= 1 && port <= 65535) {
        return port;
      }
    }
  }

  const tokens = startupCommand.trim().split(/\s+/);
  const args = parseArguments(tokens.slice(1).join(" "));
  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];
    if (token === "--port" || token === "-p") {
      const port = Number(args[index + 1]);
      if (Number.isInteger(port) && port >= 1 && port <= 65535) {
        return port;
      }
    }
    if (token.startsWith("--port=")) {
      const port = Number(token.slice("--port=".length));
      if (Number.isInteger(port) && port >= 1 && port <= 65535) {
        return port;
      }
    }
  }

  return DEFAULT_MINECRAFT_PORT;
}

export function readMinecraftServerProperties(
  workingDirectory: string,
  startupCommand: string,
): MinecraftServerProperties {
  const propsPath = path.join(workingDirectory, "server.properties");

  if (!fs.existsSync(propsPath)) {
    return {
      propertiesPresent: false,
      port: resolveMinecraftServerPortFromSources(startupCommand, null),
      maxPlayers: null,
    };
  }

  try {
    const content = fs.readFileSync(propsPath, "utf8");
    let maxPlayers: number | null = null;

    for (const line of content.split(/\r?\n/)) {
      const parsed = parsePropertiesLine(line);
      if (!parsed || parsed.key !== "max-players") {
        continue;
      }

      maxPlayers = parsePositiveInt(parsed.value) ?? DEFAULT_MINECRAFT_MAX_PLAYERS;
    }

    return {
      propertiesPresent: true,
      port: resolveMinecraftServerPortFromSources(startupCommand, content),
      maxPlayers: maxPlayers ?? DEFAULT_MINECRAFT_MAX_PLAYERS,
    };
  } catch {
    return {
      propertiesPresent: false,
      port: resolveMinecraftServerPortFromSources(startupCommand, null),
      maxPlayers: null,
    };
  }
}

export interface MinecraftServerStatus {
  online: number;
}

function writeVarInt(value: number): Buffer {
  const bytes: number[] = [];
  let current = value;

  do {
    let temp = current & 0x7f;
    current >>>= 7;
    if (current !== 0) {
      temp |= 0x80;
    }
    bytes.push(temp);
  } while (current !== 0);

  return Buffer.from(bytes);
}

function readVarInt(buffer: Buffer, offset = 0): { value: number; bytesRead: number } {
  let numRead = 0;
  let result = 0;
  let read: number;

  do {
    if (offset + numRead >= buffer.length) {
      throw new Error("Unexpected end of buffer while reading VarInt");
    }

    read = buffer[offset + numRead];
    const value = read & 0x7f;
    result |= value << (7 * numRead);
    numRead += 1;

    if (numRead > 5) {
      throw new Error("VarInt is too big");
    }
  } while ((read & 0x80) !== 0);

  return { value: result, bytesRead: numRead };
}

function writeString(value: string): Buffer {
  const body = Buffer.from(value, "utf8");
  return Buffer.concat([writeVarInt(body.length), body]);
}

function readString(buffer: Buffer, offset = 0): { value: string; bytesRead: number } {
  const lengthResult = readVarInt(buffer, offset);
  const start = offset + lengthResult.bytesRead;
  const end = start + lengthResult.value;
  const value = buffer.subarray(start, end).toString("utf8");
  return { value, bytesRead: lengthResult.bytesRead + lengthResult.value };
}

function buildPacket(packetId: number, payload: Buffer = Buffer.alloc(0)): Buffer {
  const body = Buffer.concat([writeVarInt(packetId), payload]);
  return Buffer.concat([writeVarInt(body.length), body]);
}

function parseStatusResponse(buffer: Buffer): MinecraftServerStatus | null {
  let offset = 0;
  const packetLength = readVarInt(buffer, offset);
  offset += packetLength.bytesRead;

  const packetId = readVarInt(buffer, offset);
  offset += packetId.bytesRead;

  if (packetId.value !== 0x00) {
    return null;
  }

  const jsonResult = readString(buffer, offset);
  const payload = JSON.parse(jsonResult.value) as {
    players?: { online?: number; max?: number };
  };

  const online = payload.players?.online;

  if (typeof online !== "number" || !Number.isInteger(online)) {
    return null;
  }

  return { online };
}

export function resolveMinecraftServerPort(workingDirectory: string, startupCommand: string): number {
  return readMinecraftServerProperties(workingDirectory, startupCommand).port;
}

export function resolveMinecraftServerPortForInstance(instance: Instance): number {
  return resolveMinecraftServerPort(instance.workingDirectory, instance.startupCommand);
}

export function pingMinecraftServer(
  host: string,
  port: number,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<MinecraftServerStatus | null> {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port });
    let settled = false;

    function finish(result: MinecraftServerStatus | null): void {
      if (settled) {
        return;
      }
      settled = true;
      socket.destroy();
      resolve(result);
    }

    socket.setTimeout(timeoutMs, () => finish(null));

    socket.on("error", () => finish(null));

    socket.on("connect", () => {
      const handshake = Buffer.concat([
        writeVarInt(-1),
        writeString(host),
        Buffer.from([(port >> 8) & 0xff, port & 0xff]),
        writeVarInt(1),
      ]);

      socket.write(buildPacket(0x00, handshake));
      socket.write(buildPacket(0x00));
    });

    socket.on("data", (chunk) => {
      try {
        finish(parseStatusResponse(chunk as Buffer));
      } catch {
        finish(null);
      }
    });
  });
}
