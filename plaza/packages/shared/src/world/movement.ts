import type { Tile } from './geometry.js';
import type { WorldMap } from './map.js';
import { NotImplementedError } from './not-implemented.js';

export type StepRejection = 'not-adjacent' | 'blocked' | 'out-of-bounds';

export type StepResult = { ok: true } | { ok: false; reason: StepRejection };

/**
 * Validates a single `player:move` step (ADR-005, E4-S3): the destination must be the same tile
 * (turning in place) or an adjacent one (no diagonals), inside the map and walkable.
 * Two avatars may share a tile (RN-10). Used by the server and by the local player controller.
 *
 * TODO(E4-S3): implement on top of `isAdjacent` and `isWalkable`.
 */
export function validateStep(_map: WorldMap, _from: Tile, _to: Tile): StepResult {
  throw new NotImplementedError('validateStep', 'E4-S3');
}
