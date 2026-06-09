import { describe, expect, it } from "vitest";
import { isEditableTextFile } from "./files.js";

describe("isEditableTextFile", () => {
  it("allows common source and config files", () => {
    expect(isEditableTextFile("main.py")).toBe(true);
    expect(isEditableTextFile("index.js")).toBe(true);
    expect(isEditableTextFile("app.ts")).toBe(true);
    expect(isEditableTextFile("server.properties")).toBe(true);
    expect(isEditableTextFile("config.json")).toBe(true);
  });

  it("allows hidden text config files", () => {
    expect(isEditableTextFile(".env")).toBe(true);
    expect(isEditableTextFile(".gitignore")).toBe(true);
  });

  it("allows common extensionless filenames", () => {
    expect(isEditableTextFile("Dockerfile")).toBe(true);
    expect(isEditableTextFile("Makefile")).toBe(true);
  });

  it("blocks binary and archive files", () => {
    expect(isEditableTextFile("paper.jar")).toBe(false);
    expect(isEditableTextFile("server.exe")).toBe(false);
    expect(isEditableTextFile("world.zip")).toBe(false);
    expect(isEditableTextFile("icon.png")).toBe(false);
  });
});
