import { RING_COOLDOWN_MS } from '@plaza/shared';

/**
 * RN-11: a person may ring the same person once every 30 s. Pure bookkeeping keyed by
 * space + caller + target; expired entries are dropped as new rings come in.
 */
export class RingCooldowns {
  readonly #lastRing = new Map<string, number>();

  constructor(private readonly cooldownMs: number = RING_COOLDOWN_MS) {}

  /** Entries currently remembered. */
  get size(): number {
    return this.#lastRing.size;
  }

  /**
   * Records a ring at `now` and returns `0`, or returns the milliseconds left before this caller
   * may ring this target again (nothing is recorded then).
   */
  tryRing(spaceId: string, fromUserId: string, toUserId: string, now: number): number {
    for (const [key, at] of this.#lastRing) {
      if (now - at >= this.cooldownMs) this.#lastRing.delete(key);
    }
    const key = `${spaceId}\u0000${fromUserId}\u0000${toUserId}`;
    const last = this.#lastRing.get(key);
    if (last !== undefined) return this.cooldownMs - (now - last);
    this.#lastRing.set(key, now);
    return 0;
  }
}
