import { describe, expect, it } from "vitest";
import { parseArguments } from "./parse-arguments.js";

describe("parseArguments", () => {
  it("splits simple arguments", () => {
    expect(parseArguments("-jar server.jar nogui")).toEqual([
      "-jar",
      "server.jar",
      "nogui",
    ]);
  });

  it("preserves quoted arguments", () => {
    expect(parseArguments('-jar "server jar.jar" nogui')).toEqual([
      "-jar",
      "server jar.jar",
      "nogui",
    ]);
  });
});
