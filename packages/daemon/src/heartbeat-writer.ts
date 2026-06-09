import fs from "node:fs";

const HEARTBEAT_INTERVAL_MS = 5_000;

function writeHeartbeat(socketPath: string): void {
  try {
    fs.writeFileSync(socketPath, JSON.stringify({ ts: Date.now() }), "utf8");
  } catch {
  }
}

export function startHeartbeat(socketPath: string): () => void {
  writeHeartbeat(socketPath);
  const interval = setInterval(() => writeHeartbeat(socketPath), HEARTBEAT_INTERVAL_MS);

  return () => {
    clearInterval(interval);
    try {
      fs.unlinkSync(socketPath);
    } catch {
    }
  };
}
