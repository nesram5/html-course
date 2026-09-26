import { MAX_PEERS, PROXIMITY_HYSTERESIS, PROXIMITY_RADIUS } from '../constants.js';
import type { PlayerState } from '../contracts/realtime/player.js';
import { NotImplementedError } from './not-implemented.js';

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

/**
 * Pure proximity engine (architecture §10.1, E5-S1):
 * 1. ignore people in a meeting room (RN-03) or busy (RN-04);
 * 2. all-against-all: connected if `dist <= radius`, or if they already were and
 *    `dist <= radius + hysteresis`;
 * 3. trim to `maxPeers` by distance. The relation must stay symmetric.
 *
 * TODO(E5-S1): implement, with fast-check property tests (symmetry, nobody in a room has peers).
 */
export function computePeers(
  _players: ReadonlyArray<ProximityPlayer>,
  _prev: ReadonlyMap<string, ReadonlySet<string>>,
  _cfg: ProximityConfig = DEFAULT_PROXIMITY_CONFIG,
): PeerMap {
  throw new NotImplementedError('computePeers', 'E5-S1');
}
