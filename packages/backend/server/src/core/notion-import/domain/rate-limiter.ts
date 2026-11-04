// ============================================================================
// Rate Limiter for Notion API
// ============================================================================

/**
 * Rate limiter that spaces requests to Notion's API.
 * Notion's API has a rate limit of approximately 3 requests per second.
 * This limiter ensures we don't exceed that limit.
 */
export class RateLimiter {
  private readonly minIntervalMs: number;
  private lastRequestTime: number = 0;
  private pausedUntil: number = 0;
  private pausePromise: Promise<void> | null = null;

  /**
   * Create a rate limiter with the specified minimum interval between requests.
   * @param minIntervalMs - Minimum time in milliseconds between requests
   */
  constructor(minIntervalMs: number = 350) {
    this.minIntervalMs = minIntervalMs;
  }

  /**
   * Acquire permission to make a request.
   * This will wait if the minimum interval has not passed since the last request,
   * or if the limiter is currently paused.
   */
  async acquire(): Promise<void> {
    // Wait for any active pause
    if (this.pausePromise) {
      await this.pausePromise;
    }

    const now = Date.now();
    const timeSinceLast = now - this.lastRequestTime;

    if (timeSinceLast < this.minIntervalMs) {
      const waitTime = this.minIntervalMs - timeSinceLast;
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }

    this.lastRequestTime = Date.now();
  }

  /**
   * Pause the limiter for a specified duration.
   * This is used when we receive a 429 response from Notion.
   * All pending acquire() calls will wait until the pause is over.
   * @param durationMs - Duration in milliseconds to pause
   */
  pauseFor(durationMs: number): void {
    const pauseEnd = Date.now() + durationMs;
    if (pauseEnd > this.pausedUntil) {
      this.pausedUntil = pauseEnd;
    }

    // Create a new pause promise if we're not already paused
    if (!this.pausePromise) {
      this.pausePromise = new Promise(resolve => {
        setTimeout(() => {
          this.pausePromise = null;
          this.pausedUntil = 0;
          resolve();
        }, durationMs);
      });
    }
  }

  /**
   * Check if the limiter is currently paused.
   */
  get isPaused(): boolean {
    return this.pausedUntil > Date.now();
  }

  /**
   * Get the remaining pause time in milliseconds.
   */
  get remainingPauseMs(): number {
    const remaining = this.pausedUntil - Date.now();
    return Math.max(0, remaining);
  }

  /**
   * Reset the limiter state.
   */
  reset(): void {
    this.lastRequestTime = 0;
    this.pausedUntil = 0;
    this.pausePromise = null;
  }
}
