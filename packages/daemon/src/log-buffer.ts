import type { LogLine } from "@stackpatch/shared";
import { isConsoleOutputLine } from "@stackpatch/shared";

export function parseStreamIntoLines(
  partial: string,
  text: string,
): { lines: string[]; remainder: string } {
  const lines: string[] = [];
  let current = partial;
  let index = 0;

  while (index < text.length) {
    const char = text[index];

    if (char === "\r") {
      if (text[index + 1] === "\n") {
        index += 2;
        lines.push(current);
        current = "";
        continue;
      }

      index += 1;
      current = "";
      continue;
    }

    if (char === "\n") {
      index += 1;
      lines.push(current);
      current = "";
      continue;
    }

    current += char;
    index += 1;
  }

  return { lines, remainder: current };
}

export class LogBuffer {
  private readonly maxLines: number;
  private lines: LogLine[] = [];
  private partialStdout = "";
  private partialStderr = "";

  constructor(maxLines: number) {
    this.maxLines = maxLines;
  }

  appendLine(stream: LogLine["stream"], text: string): LogLine[] {
    if (!isConsoleOutputLine(text)) {
      return [];
    }

    const line: LogLine = {
      stream,
      text,
      timestamp: new Date().toISOString(),
    };
    this.lines.push(line);

    if (this.lines.length > this.maxLines) {
      this.lines = this.lines.slice(-this.maxLines);
    }

    return [line];
  }

  append(stream: LogLine["stream"], text: string): LogLine[] {
    const partial = stream === "stdout" ? this.partialStdout : this.partialStderr;
    const parsed = parseStreamIntoLines(partial, text);

    if (stream === "stdout") {
      this.partialStdout = parsed.remainder;
    } else {
      this.partialStderr = parsed.remainder;
    }

    const added: LogLine[] = [];

    for (const chunk of parsed.lines) {
      if (!isConsoleOutputLine(chunk)) {
        continue;
      }

      const line: LogLine = {
        stream,
        text: chunk,
        timestamp: new Date().toISOString(),
      };
      this.lines.push(line);
      added.push(line);
    }

    if (this.lines.length > this.maxLines) {
      this.lines = this.lines.slice(-this.maxLines);
    }

    return added;
  }

  flushPartial(): LogLine[] {
    const added: LogLine[] = [];

    for (const stream of ["stdout", "stderr"] as const) {
      const partial = stream === "stdout" ? this.partialStdout : this.partialStderr;
      if (stream === "stdout") {
        this.partialStdout = "";
      } else {
        this.partialStderr = "";
      }

      if (!isConsoleOutputLine(partial)) {
        continue;
      }

      const line: LogLine = {
        stream,
        text: partial,
        timestamp: new Date().toISOString(),
      };
      this.lines.push(line);
      added.push(line);
    }

    if (this.lines.length > this.maxLines) {
      this.lines = this.lines.slice(-this.maxLines);
    }

    return added;
  }

  getLines(count = this.maxLines): LogLine[] {
    if (count >= this.lines.length) {
      return [...this.lines];
    }
    return this.lines.slice(-count);
  }

  loadLines(lines: LogLine[]): void {
    this.lines = lines.slice(-this.maxLines);
    this.partialStdout = "";
    this.partialStderr = "";
  }

  clear(): void {
    this.lines = [];
    this.partialStdout = "";
    this.partialStderr = "";
  }
}
