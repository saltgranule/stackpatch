import type { CSSProperties } from "react";

const ANSI_PATTERN = /\x1b\[([\d;]*)m/g;

const FOREGROUND: Record<number, string> = {
  30: "#6b7280",
  31: "#ef4444",
  32: "#22c55e",
  33: "#eab308",
  34: "#3b82f6",
  35: "#a855f7",
  36: "#06b6d4",
  37: "#f3f4f6",
  90: "#9ca3af",
  91: "#f87171",
  92: "#4ade80",
  93: "#facc15",
  94: "#60a5fa",
  95: "#c084fc",
  96: "#22d3ee",
  97: "#ffffff",
};

interface AnsiSegment {
  text: string;
  style: CSSProperties;
}

function applyCode(code: number, style: CSSProperties): CSSProperties {
  const next = { ...style };

  if (code === 0) {
    return {};
  }
  if (code === 1) {
    next.fontWeight = 700;
    return next;
  }
  if (code === 22) {
    delete next.fontWeight;
    return next;
  }
  if (FOREGROUND[code]) {
    next.color = FOREGROUND[code];
    return next;
  }
  if (code === 39) {
    delete next.color;
    return next;
  }

  return next;
}

export function parseAnsi(text: string): AnsiSegment[] {
  const segments: AnsiSegment[] = [];
  let style: CSSProperties = {};
  let lastIndex = 0;

  for (const match of text.matchAll(ANSI_PATTERN)) {
    const index = match.index ?? 0;
    if (index > lastIndex) {
      segments.push({ text: text.slice(lastIndex, index), style: { ...style } });
    }

    const codes = match[1] ? match[1].split(";").map(Number) : [0];
    for (const code of codes) {
      style = applyCode(code, style);
    }

    lastIndex = index + match[0].length;
  }

  if (lastIndex < text.length) {
    segments.push({ text: text.slice(lastIndex), style: { ...style } });
  }

  if (segments.length === 0) {
    segments.push({ text, style: {} });
  }

  return segments;
}
