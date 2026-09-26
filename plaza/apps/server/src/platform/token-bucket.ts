/**
 * Token bucket used to rate-limit socket events per connection (architecture §11.1):
 * `player:move` 10/s, `chat:send` 5/s, `reaction` 3/s...
 */
export class TokenBucket {
  readonly #capacity: number;
  readonly #refillPerMs: number;
  readonly #now: () => number;
  #tokens: number;
  #updatedAt: number;

  constructor(options: { capacity: number; refillPerSecond: number; now?: () => number }) {
    this.#capacity = options.capacity;
    this.#refillPerMs = options.refillPerSecond / 1000;
    this.#now = options.now ?? Date.now;
    this.#tokens = options.capacity;
    this.#updatedAt = this.#now();
  }

  /** Consumes one token; `false` means the event must be dropped or rejected. */
  tryTake(): boolean {
    const now = this.#now();
    this.#tokens = Math.min(
      this.#capacity,
      this.#tokens + (now - this.#updatedAt) * this.#refillPerMs,
    );
    this.#updatedAt = now;
    if (this.#tokens < 1) return false;
    this.#tokens -= 1;
    return true;
  }
}
