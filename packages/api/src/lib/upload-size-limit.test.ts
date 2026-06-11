import { describe, expect, it } from "vitest";
import { createUploadSizeLimitStream, UploadSizeLimitError } from "./upload-size-limit.js";

describe("upload size limit stream", () => {
  it("passes data through when under the limit", async () => {
    const chunks: Buffer[] = [];
    const limiter = createUploadSizeLimitStream(10);
    limiter.on("data", (chunk: Buffer) => chunks.push(chunk));

    limiter.write(Buffer.from("hello"));
    limiter.end();

    await new Promise<void>((resolve, reject) => {
      limiter.on("finish", () => resolve());
      limiter.on("error", reject);
    });

    expect(Buffer.concat(chunks).toString()).toBe("hello");
  });

  it("rejects streams that exceed the limit", async () => {
    const limiter = createUploadSizeLimitStream(5);
    const error = await new Promise<unknown>((resolve) => {
      limiter.on("error", resolve);
      limiter.write(Buffer.from("123456"));
    });

    expect(error).toBeInstanceOf(UploadSizeLimitError);
  });
});
