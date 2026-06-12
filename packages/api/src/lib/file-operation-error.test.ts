import { describe, expect, it } from "vitest";
import { PathSecurityError } from "@stackpatch/shared";
import { formatFileOperationError } from "./file-operation-error.js";

describe("formatFileOperationError", () => {
  it("returns path security messages unchanged", () => {
    expect(formatFileOperationError(new PathSecurityError("Invalid path"))).toBe("Invalid path");
  });

  it("maps out-of-memory failures to a helpful archive message", () => {
    expect(formatFileOperationError(new Error("JavaScript heap out of memory"))).toBe(
      "The selection is too large to process. Try archiving a smaller folder or fewer items.",
    );
  });

  it("maps disk space errors", () => {
    const error = new Error("No space left on device") as NodeJS.ErrnoException;
    error.code = "ENOSPC";
    expect(formatFileOperationError(error)).toBe("Not enough disk space to complete this operation");
  });
});
