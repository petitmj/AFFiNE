export interface Clock {
  now(): number;
  sleep(ms: number): Promise<void>;
}

export const systemClock: Clock = {
  now: () => Date.now(),
  sleep: ms => new Promise(resolve => setTimeout(resolve, ms)),
};

/**
 * Spaces requests evenly. Notion allows an average of three requests per
 * second per integration, so the default leaves headroom. After a 429 the
 * whole limiter pauses, so concurrent tasks back off together.
 */
export class RateLimiter {
  private nextSlot = 0;

  constructor(
    private readonly clock: Clock = systemClock,
    private readonly minIntervalMs = 350
  ) {}

  async acquire(): Promise<void> {
    const now = this.clock.now();
    const slot = Math.max(now, this.nextSlot);
    this.nextSlot = slot + this.minIntervalMs;
    const wait = slot - now;
    if (wait > 0) await this.clock.sleep(wait);
  }

  /** Nobody sends before `ms` from now. */
  penalize(ms: number): void {
    this.nextSlot = Math.max(this.nextSlot, this.clock.now() + ms);
  }
}
