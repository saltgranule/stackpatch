import { describe, expect, it } from "vitest";
import { formatMinecraftPlayers, shouldShowMinecraftPlayers } from "./application-stats.js";

describe("application stats", () => {
  it("formats player count with max players", () => {
    expect(
      formatMinecraftPlayers({
        playerCount: 3,
        maxPlayers: 20,
        propertiesPresent: true,
        reachable: true,
      }),
    ).toBe("3 / 20");
  });

  it("returns null when properties are missing or server is unreachable", () => {
    expect(
      formatMinecraftPlayers({
        playerCount: 3,
        maxPlayers: 20,
        propertiesPresent: false,
        reachable: true,
      }),
    ).toBeNull();

    expect(
      formatMinecraftPlayers({
        playerCount: null,
        maxPlayers: 20,
        propertiesPresent: true,
        reachable: false,
      }),
    ).toBeNull();
  });

  it("shows players only for running reachable minecraft servers with properties", () => {
    expect(
      shouldShowMinecraftPlayers("running", {
        playerCount: 1,
        maxPlayers: 20,
        propertiesPresent: true,
        reachable: true,
      }),
    ).toBe(true);

    expect(
      shouldShowMinecraftPlayers("stopped", {
        playerCount: 0,
        maxPlayers: 20,
        propertiesPresent: true,
        reachable: false,
      }),
    ).toBe(false);
  });
});
