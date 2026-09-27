import { changedPeers, computePeers, type PeerMap, type PeersChange } from '@plaza/shared';

import type { SpaceRuntime } from './space-runtime.js';

/**
 * Hallway conversations of each person, for the product events (E8-S7, O1): a conversation
 * starts when someone goes from no peers to at least one, and ends when they have none again
 * (walked away, entered a room, went busy or left). Group size changes in between do not split it.
 */
export interface ConversationListener {
  started(userId: string): void;
  ended(userId: string, durationMs: number, maxPeers: number): void;
}

interface OpenConversation {
  readonly since: number;
  maxPeers: number;
}

/**
 * Hallway conversations of one space (E5-S2, architecture §10.1). Keeps the last
 * `computePeers` result (the hysteresis needs it) and, on each working tick:
 * 1. recomputes the peers of everyone in the runtime (people in a meeting room or busy have none);
 * 2. flags `inConversation` in the runtime, so the change reaches `world:delta.changed` (💬);
 * 3. returns who must get `media:peers`: only the people whose set changed, plus the ones that
 *    (re)connected since the last tick and need their current list.
 *
 * The logic is the pure `computePeers` / `changedPeers` of `@plaza/shared`; this class only keeps
 * the state between ticks. No sockets, no timers.
 */
export class HallwayPeers {
  #peers: PeerMap = new Map();
  readonly #resend = new Set<string>();
  readonly #conversations = new Map<string, OpenConversation>();

  /** `now` is in milliseconds (the world timers' clock). */
  constructor(
    private readonly listener: ConversationListener | null = null,
    private readonly now: () => number = () => 0,
  ) {}

  /** `true` when someone is waiting for their list: the next tick must run even if idle. */
  get pending(): boolean {
    return this.#resend.size > 0;
  }

  /** The person (re)joined with a new connection: send them their list on the next tick. */
  resend(userId: string): void {
    this.#resend.add(userId);
  }

  /** Current hallway peers of a person (sorted), empty when none or not in the space. */
  peersOf(userId: string): string[] {
    return [...(this.#peers.get(userId) ?? [])].sort();
  }

  /** People with at least one hallway peer, i.e. in a conversation (`/api/health`, E8-S1). */
  get inConversationCount(): number {
    let count = 0;
    for (const peers of this.#peers.values()) if (peers.size > 0) count++;
    return count;
  }

  /** Steps 1–3 above. Call it right before `runtime.flush()`. */
  update(runtime: SpaceRuntime): PeersChange[] {
    const next = computePeers(runtime.players(), this.#peers);
    const changes = changedPeers(this.#peers, next, this.#resend);
    this.#trackConversations(next);
    this.#peers = next;
    this.#resend.clear();
    for (const { userId, peers } of changes) {
      runtime.update(userId, { inConversation: peers.length > 0 });
    }
    return changes;
  }

  #trackConversations(next: PeerMap): void {
    if (this.listener === null) return;
    const at = this.now();
    for (const [userId, peers] of next) {
      if (peers.size === 0) continue;
      const open = this.#conversations.get(userId);
      if (open === undefined) {
        this.#conversations.set(userId, { since: at, maxPeers: peers.size });
        this.listener.started(userId);
      } else {
        open.maxPeers = Math.max(open.maxPeers, peers.size);
      }
    }
    for (const [userId, open] of this.#conversations) {
      if ((next.get(userId)?.size ?? 0) > 0) continue;
      this.#conversations.delete(userId);
      this.listener.ended(userId, Math.max(0, at - open.since), open.maxPeers);
    }
  }
}
