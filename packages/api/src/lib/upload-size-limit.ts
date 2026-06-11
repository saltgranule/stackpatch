import { Transform } from "node:stream";

export class UploadSizeLimitError extends Error {
  readonly maxBytes: number;

  constructor(maxBytes: number) {
    super(`File exceeds maximum upload size of ${maxBytes} bytes`);
    this.name = "UploadSizeLimitError";
    this.maxBytes = maxBytes;
  }
}

export function createUploadSizeLimitStream(maxBytes: number): Transform {
  let total = 0;

  return new Transform({
    transform(chunk, _encoding, callback) {
      total += chunk.length;
      if (total > maxBytes) {
        callback(new UploadSizeLimitError(maxBytes));
        return;
      }
      callback(null, chunk);
    },
  });
}
