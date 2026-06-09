import { describe, expect, it } from "vitest";
import { formatStartupCommand, parseStartupCommand } from "./startup-command.js";

describe("startup-command", () => {
  it("parses executable and arguments", () => {
    expect(
      parseStartupCommand('java -jar "server jar.jar" nogui'),
    ).toEqual({
      executablePath: "java",
      arguments: '-jar "server jar.jar" nogui',
    });
  });

  it("formats a startup command for display", () => {
    expect(formatStartupCommand("java", "-jar server.jar")).toBe(
      "java -jar server.jar",
    );
  });
});
