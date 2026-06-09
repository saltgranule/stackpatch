import { describe, expect, it } from "vitest";
import { canChangeUserRole, canDeleteUser } from "./user-policy.js";

const admin = { id: "a1", username: "admin", role: "admin" as const, theme: "system" as const };

describe("user-policy", () => {
  it("blocks deleting your own account", () => {
    const result = canDeleteUser(admin, admin, 1);
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("own account");
  });

  it("blocks deleting the last admin", () => {
    const result = canDeleteUser(admin, { id: "a2", role: "admin" }, 1);
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("last admin");
  });

  it("allows deleting non-admin users", () => {
    const result = canDeleteUser(admin, { id: "v1", role: "viewer" }, 1);
    expect(result.allowed).toBe(true);
  });

  it("blocks demoting the last admin", () => {
    const lastAdmin = { id: "a2", role: "admin" as const };
    const result = canChangeUserRole(admin, lastAdmin, "viewer", 1);
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("last admin");
  });

  it("allows deleting viewers when another admin exists", () => {
    const viewer = { id: "v1", role: "viewer" as const };
    const result = canDeleteUser(admin, viewer, 2);
    expect(result.allowed).toBe(true);
  });
});
