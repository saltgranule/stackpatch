import { describe, expect, it } from "vitest";
import { canAccessInstanceRole, getEffectiveInstanceRole } from "./permissions.js";

describe("permissions", () => {
  it("treats admin as full access", () => {
    expect(getEffectiveInstanceRole("admin", null)).toBe("admin");
    expect(canAccessInstanceRole("admin", null, "viewer")).toBe(true);
    expect(canAccessInstanceRole("admin", null, "admin")).toBe(true);
  });

  it("uses per-instance permission for non-admin users", () => {
    expect(getEffectiveInstanceRole("viewer", "viewer")).toBe("viewer");
    expect(canAccessInstanceRole("viewer", "viewer", "viewer")).toBe(true);
    expect(canAccessInstanceRole("viewer", null, "viewer")).toBe(false);
    expect(canAccessInstanceRole("viewer", "viewer", "admin")).toBe(false);
  });
});
