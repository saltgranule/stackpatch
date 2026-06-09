import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { PathSecurityError } from "./path-security.js";
import { validateStartupCommandFiles } from "./startup-validation.js";

describe("validateStartupCommandFiles", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "stackpatch-startup-"));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("accepts existing startup command files", () => {
    const script = path.join(tempDir, "main.py");
    fs.writeFileSync(script, "print('ok')\n");

    expect(() =>
      validateStartupCommandFiles("python", "main.py", tempDir),
    ).not.toThrow();
  });

  it("rejects missing startup command files", () => {
    expect(() =>
      validateStartupCommandFiles("python", "main.py", tempDir),
    ).toThrow(
      new PathSecurityError("File from startup command not found in instance: main.py"),
    );
  });
});
