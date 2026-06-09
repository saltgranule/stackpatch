import { describe, expect, it } from "vitest";
import { LogBuffer, parseStreamIntoLines } from "./log-buffer.js";

describe("parseStreamIntoLines", () => {
  it("treats carriage return as line overwrite", () => {
    expect(parseStreamIntoLines("loading", "...\rdone\n")).toEqual({
      lines: ["done"],
      remainder: "",
    });
  });

  it("handles Windows newlines", () => {
    expect(parseStreamIntoLines("", "first\r\nsecond\n")).toEqual({
      lines: ["first", "second"],
      remainder: "",
    });
  });
});

describe("LogBuffer", () => {
  it("buffers partial lines until a newline arrives", () => {
    const buffer = new LogBuffer(10);
    buffer.append("stdout", "hello ");
    expect(buffer.getLines()).toEqual([]);
    buffer.append("stdout", "world\n");
    expect(buffer.getLines()).toEqual([
      expect.objectContaining({ text: "hello world" }),
    ]);
  });

  it("skips blank lines but keeps prompt-like output", () => {
    const buffer = new LogBuffer(10);
    buffer.append("stdout", "\n>\n\nline\n");
    expect(buffer.getLines()).toEqual([
      expect.objectContaining({ text: ">" }),
      expect.objectContaining({ text: "line" }),
    ]);
  });

  it("keeps discord-style logging lines", () => {
    const buffer = new LogBuffer(10);
    buffer.append(
      "stderr",
      "2026-06-08 19:00:00,123 | INFO     | discord.gateway | Shard ID None has connected to Gateway\n",
    );
    expect(buffer.getLines()).toEqual([
      expect.objectContaining({
        stream: "stderr",
        text: "2026-06-08 19:00:00,123 | INFO     | discord.gateway | Shard ID None has connected to Gateway",
      }),
    ]);
  });

  it("writes complete lines immediately with appendLine", () => {
    const buffer = new LogBuffer(10);
    const added = buffer.appendLine("stderr", "File from startup command not found in instance: main.py");
    expect(added).toHaveLength(1);
    expect(buffer.getLines()).toEqual([
      expect.objectContaining({
        stream: "stderr",
        text: "File from startup command not found in instance: main.py",
      }),
    ]);
  });

  it("flushes trailing partial output", () => {
    const buffer = new LogBuffer(10);
    buffer.append("stdout", "no trailing newline");
    expect(buffer.getLines()).toEqual([]);
    const flushed = buffer.flushPartial();
    expect(flushed).toEqual([
      expect.objectContaining({ text: "no trailing newline" }),
    ]);
  });

  it("keeps only the most recent lines", () => {
    const buffer = new LogBuffer(3);
    buffer.append("stdout", "line 1\n");
    buffer.append("stdout", "line 2\n");
    buffer.append("stderr", "line 3\n");
    buffer.append("stdout", "line 4\n");

    expect(buffer.getLines()).toEqual([
      expect.objectContaining({ text: "line 2", stream: "stdout" }),
      expect.objectContaining({ text: "line 3", stream: "stderr" }),
      expect.objectContaining({ text: "line 4", stream: "stdout" }),
    ]);
  });
});
