import { describe, expect, it } from "vitest";
import { collectStartupCommandTargets } from "./startup-targets.js";

describe("collectStartupCommandTargets", () => {
  it("collects script files for interpreter commands", () => {
    expect(collectStartupCommandTargets("python", "main.py")).toEqual(["main.py"]);
  });

  it("collects jar files after -jar", () => {
    expect(collectStartupCommandTargets("java", '-jar "server jar.jar" nogui')).toEqual([
      "server jar.jar",
    ]);
  });

  it("collects relative paths and known extensions", () => {
    expect(collectStartupCommandTargets("node", "scripts/index.js --watch")).toEqual([
      "scripts/index.js",
    ]);
  });

  it("returns no targets for commands without file references", () => {
    expect(collectStartupCommandTargets("java", "-version")).toEqual([]);
  });
});
