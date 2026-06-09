export function parseArguments(raw: string): string[] {
  if (!raw.trim()) {
    return [];
  }

  const matches = raw.match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g) ?? [];
  return matches.map((token) => token.replace(/^["']|["']$/g, ""));
}
