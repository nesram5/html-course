import { MAX_PEERS, PROXIMITY_HYSTERESIS, PROXIMITY_RADIUS } from '../constants.js';
import type { PlayerState } from '../contracts/realtime/player.js';

/** Fields of a player the proximity engine needs. `PlayerState` satisfies it. */
export type ProximityPlayer = Pick<PlayerState, 'userId' | 'x' | 'y' | 'roomId' | 'status'>;

export interface ProximityConfig {
  /** Connect at `distance <= radius` (RN-01). */
  readonly radius: number;
  /** Keep an existing connection while `distance <= radius + hysteresis` (RN-02). */
  readonly hysteresis: number;
  /** Keep at most this many peers per person, closest first (RN-07). */
  readonly maxPeers: number;
}

export const DEFAULT_PROXIMITY_CONFIG: ProximityConfig = {
  radius: PROXIMITY_RADIUS,
  hysteresis: PROXIMITY_HYSTERESIS,
  maxPeers: MAX_PEERS,
};

/** userId → set of hallway peers' userIds. */
export type PeerMap = Map<string, Set<string>>;

/** A candidate connection between players `a` and `b` (indexes into the eligible list). */
interface Candidate {
  a: number;
  b: number;
  distSq: number;
  wasConnected: boolean;
  /** Stable tie-break between candidates at the same distance. */
  key: string;
}

function wereConnected(
  prev: ReadonlyMap<string, ReadonlySet<string>>,
  a: string,
  b: string,
): boolean {
  return prev.get(a)?.has(b) === true || prev.get(b)?.has(a) === true;
}

function byPriority(x: Candidate, y: Candidate): number {
  if (x.distSq !== y.distSq) return x.distSq - y.distSq;
  // Same distance: keep existing conversations first, then a deterministic order.
  if (x.wasConnected !== y.wasConnected) return x.wasConnected ? -1 : 1;
  if (x.key < y.key) return -1;
  return x.key > y.key ? 1 : 0;
}

/**
 * Pure proximity engine (architecture §10.1, E5-S1):
 * 1. ignore people in a meeting room (RN-03) or busy (RN-04);
 * 2. all-against-all: connected if `dist <= radius`, or if they already were (in `prev`, in
 *    either direction) and `dist <= radius + hysteresis`;
 * 3. trim to `maxPeers` by distance: candidate pairs are accepted closest first while BOTH ends
 *    still have room, so the relation stays symmetric and nobody exceeds the cap.
 *
 * The result has an entry (possibly an empty set) for EVERY input player, so the caller can diff
 * it against the previous one and emit `media:peers []` to whoever lost all peers.
 * With n ≤ 50 players there are at most 1 225 pairs (well under 1 ms per call).
 */
export function computePeers(
  players: ReadonlyArray<ProximityPlayer>,
  prev: ReadonlyMap<string, ReadonlySet<string>>,
  cfg: ProximityConfig = DEFAULT_PROXIMITY_CONFIG,
): PeerMap {
  const result: PeerMap = new Map();
  for (const player of players) result.set(player.userId, new Set());

  const eligible = players.filter((p) => p.roomId === null && p.status !== 'busy');
  const connectSq = cfg.radius * cfg.radius;
  const keepRadius = cfg.radius + cfg.hysteresis;
  const keepSq = keepRadius * keepRadius;

  const candidates: Candidate[] = [];
  for (let i = 0; i < eligible.length; i++) {
    const a = eligible[i];
    if (a === undefined) continue;
    for (let j = i + 1; j < eligible.length; j++) {
      const b = eligible[j];
      if (b === undefined || a.userId === b.userId) continue;
      const dx = a.x - b.x;
      const dy = a.y - b.y;
      const distSq = dx * dx + dy * dy;
      if (distSq > keepSq) continue;
      const wasConnected = wereConnected(prev, a.userId, b.userId);
      if (distSq > connectSq && !wasConnected) continue;
      const key = a.userId < b.userId ? `${a.userId}\n${b.userId}` : `${b.userId}\n${a.userId}`;
      candidates.push({ a: i, b: j, distSq, wasConnected, key });
    }
  }
  candidates.sort(byPriority);

  const degree = new Array<number>(eligible.length).fill(0);
  for (const { a, b } of candidates) {
    if ((degree[a] ?? 0) >= cfg.maxPeers || (degree[b] ?? 0) >= cfg.maxPeers) continue;
    const idA = eligible[a]?.userId;
    const idB = eligible[b]?.userId;
    if (idA === undefined || idB === undefined) continue;
    result.get(idA)?.add(idB);
    result.get(idB)?.add(idA);
    degree[a] = (degree[a] ?? 0) + 1;
    degree[b] = (degree[b] ?? 0) + 1;
  }
  return result;
}

function sameSet(a: ReadonlySet<string> | undefined, b: ReadonlySet<string>): boolean {
  if ((a?.size ?? 0) !== b.size) return false;
  for (const id of b) if (a?.has(id) !== true) return false;
  return true;
}

/** A person whose hallway peers must be sent (`media:peers`). */
export interface PeersChange {
  readonly userId: string;
  /** Sorted userIds. */
  readonly peers: string[];
}

/**
 * Who must be told about their hallway peers after a new {@link computePeers} result (E5-S2,
 * architecture §10.1 step 4): the people of `next` whose set differs from `prev` (a missing
 * entry counts as "no peers"), plus the ones in `force` (just joined or reconnected: they need
 * their current list even when it did not change). People only in `prev` left the space and
 * are not listed. Keeps the iteration order of `next`.
 */
export function changedPeers(
  prev: ReadonlyMap<string, ReadonlySet<string>>,
  next: ReadonlyMap<string, ReadonlySet<string>>,
  force: ReadonlySet<string> = new Set(),
): PeersChange[] {
  const changes: PeersChange[] = [];
  for (const [userId, peers] of next) {
    if (!force.has(userId) && sameSet(prev.get(userId), peers)) continue;
    changes.push({ userId, peers: [...peers].sort() });
  }
  return changes;
}
