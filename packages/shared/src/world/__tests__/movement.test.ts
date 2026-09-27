import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { MOVE_RATE_PER_SEC } from '../../constants.js';
import { DIRECTIONS, isAdjacent, isSameTile, stepTowards } from '../geometry.js';
import {
  MOVE_RATE_LIMIT,
  initialRateLimitState,
  takeToken,
  validateStep,
  type RateLimitState,
} from '../movement.js';
import { gridMap } from './grid-fixture.js';

// 5×4 map: a wall in the middle column (x = 2) with a gap at y = 3.
const map = gridMap([
  '..#..', //
  '..#..',
  '..#..',
  '.....',
]);

describe('validateStep (E4-S3)', () => {
  it('accepts a step to an adjacent walkable tile in each direction', () => {
    const from = { x: 1, y: 1 };
    for (const dir of DIRECTIONS) {
      const to = stepTowards(from, dir);
      if (to.x === 2) continue; // the wall, checked below
      expect(validateStep(map, from, to)).toEqual({ ok: true });
    }
  });

  it('accepts turning in place (same tile)', () => {
    expect(validateStep(map, { x: 0, y: 0 }, { x: 0, y: 0 })).toEqual({ ok: true });
  });

  it('rejects diagonal and multi-tile jumps (teleports) as not-adjacent', () => {
    expect(validateStep(map, { x: 0, y: 0 }, { x: 1, y: 1 })).toEqual({
      ok: false,
      reason: 'not-adjacent',
    });
    expect(validateStep(map, { x: 0, y: 3 }, { x: 4, y: 3 })).toEqual({
      ok: false,
      reason: 'not-adjacent',
    });
    // Jumping over the wall.
    expect(validateStep(map, { x: 1, y: 0 }, { x: 3, y: 0 })).toEqual({
      ok: false,
      reason: 'not-adjacent',
    });
  });

  it('rejects a step onto a blocked tile', () => {
    expect(validateStep(map, { x: 1, y: 0 }, { x: 2, y: 0 })).toEqual({
      ok: false,
      reason: 'blocked',
    });
  });

  it('lets the wall be crossed through its gap', () => {
    expect(validateStep(map, { x: 1, y: 3 }, { x: 2, y: 3 })).toEqual({ ok: true });
    expect(validateStep(map, { x: 2, y: 3 }, { x: 3, y: 3 })).toEqual({ ok: true });
  });

  it('rejects steps outside the map', () => {
    expect(validateStep(map, { x: 0, y: 0 }, { x: -1, y: 0 })).toEqual({
      ok: false,
      reason: 'out-of-bounds',
    });
    expect(validateStep(map, { x: 4, y: 3 }, { x: 4, y: 4 })).toEqual({
      ok: false,
      reason: 'out-of-bounds',
    });
    expect(validateStep(map, { x: 4, y: 0 }, { x: 5, y: 0 })).toEqual({
      ok: false,
      reason: 'out-of-bounds',
    });
  });

  it('rejects non-integer coordinates', () => {
    expect(validateStep(map, { x: 0, y: 0 }, { x: 0.5, y: 0 })).toMatchObject({ ok: false });
  });

  it('ignores other players: two avatars may share a tile (RN-10)', () => {
    // validateStep has no notion of players at all; a shared tile is just a walkable tile.
    expect(validateStep(map, { x: 0, y: 1 }, { x: 0, y: 2 })).toEqual({ ok: true });
  });

  it('property: accepted steps are always adjacent (or in place) and walkable', () => {
    const coord = fc.integer({ min: -2, max: 7 });
    fc.assert(
      fc.property(coord, coord, coord, coord, (fx, fy, tx, ty) => {
        const from = { x: fx, y: fy };
        const to = { x: tx, y: ty };
        const result = validateStep(map, from, to);
        if (result.ok) {
          expect(isSameTile(from, to) || isAdjacent(from, to)).toBe(true);
          expect(tx >= 0 && ty >= 0 && tx < map.width && ty < map.height).toBe(true);
          expect(map.collisionGrid[ty * map.width + tx]).toBe(0);
        }
      }),
    );
  });
});

describe('takeToken (rate limit, E4-S3)', () => {
  it('allows 10 moves per second and drops the extra ones', () => {
    let state: RateLimitState = initialRateLimitState(MOVE_RATE_LIMIT, 0);
    const results: boolean[] = [];
    // A burst of 15 moves within 15 ms.
    for (let i = 0; i < 15; i++) {
      const out = takeToken(state, i, MOVE_RATE_LIMIT);
      state = out.state;
      results.push(out.allowed);
    }
    expect(results.slice(0, MOVE_RATE_PER_SEC).every(Boolean)).toBe(true);
    expect(results.slice(MOVE_RATE_PER_SEC).some(Boolean)).toBe(false);

    // One second later the bucket is full again.
    expect(takeToken(state, 1014, MOVE_RATE_LIMIT).allowed).toBe(true);
  });

  it('never allows more than capacity + rate × elapsed over any window', () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: 0, max: 400 }), { minLength: 1, maxLength: 200 }),
        (gaps) => {
          let now = 0;
          let state = initialRateLimitState(MOVE_RATE_LIMIT, now);
          let allowed = 0;
          for (const gap of gaps) {
            now += gap;
            const out = takeToken(state, now, MOVE_RATE_LIMIT);
            state = out.state;
            if (out.allowed) allowed++;
          }
          expect(allowed).toBeLessThanOrEqual(
            MOVE_RATE_LIMIT.capacity + Math.floor((now * MOVE_RATE_LIMIT.refillPerSecond) / 1000),
          );
        },
      ),
    );
  });

  it('keeps a steady 10 moves/s walk always allowed', () => {
    let state = initialRateLimitState(MOVE_RATE_LIMIT, 0);
    for (let i = 1; i <= 100; i++) {
      const out = takeToken(state, i * 100, MOVE_RATE_LIMIT);
      expect(out.allowed).toBe(true);
      state = out.state;
    }
  });

  it('is pure and never refills above capacity nor with a clock going backwards', () => {
    const empty: RateLimitState = { tokens: 0, updatedAt: 1000 };
    const back = takeToken(empty, 500, MOVE_RATE_LIMIT);
    expect(back.allowed).toBe(false);
    expect(back.state).toEqual({ tokens: 0, updatedAt: 1000 });
    expect(empty).toEqual({ tokens: 0, updatedAt: 1000 });

    const later = takeToken(empty, 1_000_000, MOVE_RATE_LIMIT);
    expect(later).toEqual({
      allowed: true,
      state: { tokens: MOVE_RATE_LIMIT.capacity - 1, updatedAt: 1_000_000 },
    });
  });
});
