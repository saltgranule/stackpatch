import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { v4 as uuid } from "uuid";

describe("user-policy", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "stackpatch-policy-"));
    process.env.STACKPATCH_DATA_DIR = tempDir;
  });

  afterEach(() => {
    delete process.env.STACKPATCH_DATA_DIR;
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("blocks deleting your own account", async () => {
    const { createUser } = await import("../db/users.js");
    const { hashPassword } = await import("./password.js");
    const { validateUserDeletion } = await import("./user-policy.js");
    const { closeDatabase } = await import("../db/database.js");

    const id = uuid();
    createUser(id, "admin", await hashPassword("secret"), "admin");

    const result = validateUserDeletion(
      { id, username: "admin", role: "admin", theme: "system" },
      id,
    );

    expect(result.allowed).toBe(false);
    expect(result.error).toContain("own account");
    closeDatabase();
  });

  it("blocks deleting the last admin", async () => {
    const { createUser } = await import("../db/users.js");
    const { hashPassword } = await import("./password.js");
    const { validateUserDeletion } = await import("./user-policy.js");
    const { closeDatabase } = await import("../db/database.js");

    const soleAdminId = uuid();
    createUser(soleAdminId, "sole-admin", await hashPassword("secret"), "admin");

    const result = validateUserDeletion(
      { id: uuid(), username: "other-admin", role: "admin", theme: "system" },
      soleAdminId,
    );

    expect(result.allowed).toBe(false);
    expect(result.error).toContain("last admin");
    closeDatabase();
  });
});
