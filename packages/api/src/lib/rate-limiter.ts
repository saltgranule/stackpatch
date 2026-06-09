export class RateLimiter {
  private readonly maxPerWindow: number;
  private readonly windowMs: number;
  private timestamps: number[] = [];

  constructor(maxPerWindow: number, windowMs: number) {
    this.maxPerWindow = maxPerWindow;
    this.windowMs = windowMs;
  }

  tryConsume(): boolean {
    const now = Date.now();
    this.timestamps = this.timestamps.filter((timestamp) => now - timestamp < this.windowMs);

    if (this.timestamps.length >= this.maxPerWindow) {
      return false;
    }

    this.timestamps.push(now);
    return true;
  }
}
