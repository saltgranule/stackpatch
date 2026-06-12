import { describe, expect, it } from "vitest";
import { extractApiErrorMessage } from "./api-error.js";

describe("extractApiErrorMessage", () => {
  it("prefers Fastify message over generic internal server error label", () => {
    expect(
      extractApiErrorMessage(
        {
          statusCode: 500,
          error: "Internal Server Error",
          message: "JavaScript heap out of memory",
        },
        500,
      ),
    ).toBe("JavaScript heap out of memory");
  });

  it("uses stackpatch error payloads", () => {
    expect(extractApiErrorMessage({ error: "Upload directory does not exist" }, 400)).toBe(
      "Upload directory does not exist",
    );
  });

  it("falls back to plain text responses", () => {
    expect(extractApiErrorMessage(null, 502, "Bad Gateway")).toBe("Bad Gateway");
  });
});
