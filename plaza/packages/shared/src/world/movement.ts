import { MOVE_RATE_PER_SEC } from '../constants.js';
import { isAdjacent, isSameTile, type Tile } from './geometry.js';
import { cellState, type CollisionGrid } from './grid.js';

export type StepRejection = 'not-adjacent' | 'blocked' | 'out-of-bounds';

export type StepResult = { ok: true } | { ok: false; reason: StepRejection };

/**
 * Validates a single `player:move` step (ADR-005, E4-S3): the destination must be the same tile
 * (turning in place) or an adjacent one (no diagonals), inside the map and walkable.
 * Two avatars may share a tile (RN-10): other players are not an obstacle.
 * Used by the server and by the local player controller.
 *
 * Only the collision grid of the map is read, so any `WorldMap` works.
 */
export function validateStep(map: CollisionGrid, from: Tile, to: Tile): StepResult {
  if (!isSameTile(from, to) && !isAdjacent(from, to)) {
    return { ok: false, reason: 'not-adjacent' };
  }
  const state = cellState(map, to.x, to.y);
  return state === 'walkable' ? { ok: true } : { ok: false, reason: state };
}

/** Parameters of a token bucket: `capacity` tokens, refilled at `refillPerSecond`. */
export interface RateLimit {
  readonly capacity: number;
  readonly refillPerSecond: number;
}

/** State of a token bucket. Keep one per socket and event type. */
export interface RateLimitState {
  /** Available tokens (fractional while refilling). */
  readonly tokens: number;
  /** Time of the last update in milliseconds (any monotonic clock). */
  readonly updatedAt: number;
}

/** `player:move`: at most 10 steps per second; the extra ones are dropped (E4-S3). */
export const MOVE_RATE_LIMIT: RateLimit = {
  capacity: MOVE_RATE_PER_SEC,
  refillPerSecond: MOVE_RATE_PER_SEC,
};

/** A full bucket created at `now`. */
export function initialRateLimitState(limit: RateLimit, now: number): RateLimitState {
  return { tokens: limit.capacity, updatedAt: now };
}

/**
 * Pure token bucket (architecture §11.1): refills the bucket up to `now` and tries to take one
 * token. Returns whether the event is allowed and the new state (the input is not modified).
 * A clock going backwards never adds tokens.
 */
export function takeToken(
  state: RateLimitState,
  now: number,
  limit: RateLimit,
): { allowed: boolean; state: RateLimitState } {
  const elapsedMs = Math.max(0, now - state.updatedAt);
  const tokens = Math.min(
    limit.capacity,
    state.tokens + (elapsedMs * limit.refillPerSecond) / 1000,
  );
  const updatedAt = Math.max(now, state.updatedAt);
  if (tokens < 1) return { allowed: false, state: { tokens, updatedAt } };
  return { allowed: true, state: { tokens: tokens - 1, updatedAt } };
}
