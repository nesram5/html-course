import { changedPeers, computePeers, type PeerMap, type PeersChange } from '@plaza/shared';

import type { SpaceRuntime } from './space-runtime.js';

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
    this.#peers = next;
    this.#resend.clear();
    for (const { userId, peers } of changes) {
      runtime.update(userId, { inConversation: peers.length > 0 });
    }
    return changes;
  }
}
