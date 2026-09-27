import { REACTION_RATE_PER_SEC } from '@plaza/shared';

/**
 * Client-side limit of reactions (E7-S4: at most 3 per second), so holding a key does not flood
 * the server (which enforces the same limit and answers `RATE_LIMITED`).
 */
export class ReactionThrottle {
  private readonly sent: number[] = [];

  constructor(
    private readonly perSecond: number = REACTION_RATE_PER_SEC,
    private readonly now: () => number = Date.now,
  ) {}

  /** `true` when a reaction may be sent now (and counts it). */
  tryTake(): boolean {
    const now = this.now();
    while (this.sent.length > 0 && now - (this.sent[0] ?? 0) >= 1000) this.sent.shift();
    if (this.sent.length >= this.perSecond) return false;
    this.sent.push(now);
    return true;
  }
}
