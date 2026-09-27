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

/**
 * One {@link TokenBucket} per key (e.g. per person, across all their connections). Keys idle
 * long enough for their bucket to be full again are forgotten, so the map only holds keys that
 * were active recently.
 */
export class KeyedTokenBuckets {
  readonly #buckets = new Map<string, { bucket: TokenBucket; lastUsed: number }>();
  readonly #capacity: number;
  readonly #refillPerSecond: number;
  readonly #now: () => number;
  /** Time for an empty bucket to be full again. */
  readonly #idleMs: number;

  constructor(options: { capacity: number; refillPerSecond: number; now?: () => number }) {
    this.#capacity = options.capacity;
    this.#refillPerSecond = options.refillPerSecond;
    this.#now = options.now ?? Date.now;
    this.#idleMs = (options.capacity / options.refillPerSecond) * 1000;
  }

  /** Keys currently tracked. */
  get size(): number {
    return this.#buckets.size;
  }

  /** Consumes one token of `key`; `false` means the event must be rejected. */
  tryTake(key: string): boolean {
    const now = this.#now();
    for (const [other, entry] of this.#buckets) {
      if (now - entry.lastUsed >= this.#idleMs) this.#buckets.delete(other);
    }
    let entry = this.#buckets.get(key);
    if (entry === undefined) {
      entry = {
        bucket: new TokenBucket({
          capacity: this.#capacity,
          refillPerSecond: this.#refillPerSecond,
          now: this.#now,
        }),
        lastUsed: now,
      };
      this.#buckets.set(key, entry);
    }
    entry.lastUsed = now;
    return entry.bucket.tryTake();
  }
}
