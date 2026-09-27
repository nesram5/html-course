import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { TILE_SIZE } from '../../constants.js';
import {
  DIRECTIONS,
  directionBetween,
  distance,
  distanceSquared,
  isAdjacent,
  isInsideRect,
  isSameTile,
  pixelToTile,
  stepTowards,
  tileCenterToPixel,
  tileKey,
  type Tile,
} from '../geometry.js';

const tileArb = fc.record({
  x: fc.integer({ min: 0, max: 200 }),
  y: fc.integer({ min: 0, max: 200 }),
});

describe('distance', () => {
  it('is euclidean between tile coordinates', () => {
    expect(distance({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5);
    expect(distanceSquared({ x: 1, y: 1 }, { x: 4, y: 5 })).toBe(25);
  });

  it('is symmetric and zero only for the same tile', () => {
    fc.assert(
      fc.property(tileArb, tileArb, (a, b) => {
        expect(distance(a, b)).toBe(distance(b, a));
        expect(distance(a, b) === 0).toBe(isSameTile(a, b));
      }),
    );
  });
});

describe('isAdjacent', () => {
  it('accepts the four neighbours only', () => {
    const origin = { x: 5, y: 5 };
    expect(isAdjacent(origin, { x: 5, y: 4 })).toBe(true);
    expect(isAdjacent(origin, { x: 6, y: 5 })).toBe(true);
    expect(isAdjacent(origin, { x: 5, y: 5 })).toBe(false);
    expect(isAdjacent(origin, { x: 6, y: 6 })).toBe(false);
    expect(isAdjacent(origin, { x: 7, y: 5 })).toBe(false);
  });

  it('is symmetric', () => {
    fc.assert(
      fc.property(tileArb, tileArb, (a, b) => {
        expect(isAdjacent(a, b)).toBe(isAdjacent(b, a));
      }),
    );
  });
});

describe('stepTowards / directionBetween', () => {
  it('moves one tile in each direction (y grows downwards)', () => {
    const origin = { x: 2, y: 2 };
    expect(stepTowards(origin, 'up')).toEqual({ x: 2, y: 1 });
    expect(stepTowards(origin, 'down')).toEqual({ x: 2, y: 3 });
    expect(stepTowards(origin, 'left')).toEqual({ x: 1, y: 2 });
    expect(stepTowards(origin, 'right')).toEqual({ x: 3, y: 2 });
  });

  it('round-trips: the direction of a step is the direction taken', () => {
    fc.assert(
      fc.property(tileArb, fc.constantFrom(...DIRECTIONS), (tile, dir) => {
        const next = stepTowards(tile, dir);
        expect(isAdjacent(tile, next)).toBe(true);
        expect(directionBetween(tile, next)).toBe(dir);
      }),
    );
  });

  it('returns null for tiles that are not adjacent', () => {
    expect(directionBetween({ x: 0, y: 0 }, { x: 0, y: 0 })).toBeNull();
    expect(directionBetween({ x: 0, y: 0 }, { x: 1, y: 1 })).toBeNull();
  });
});

describe('isInsideRect', () => {
  const rect = { x: 2, y: 3, width: 4, height: 2 };

  it('includes the start edge and excludes the end edge', () => {
    expect(isInsideRect({ x: 2, y: 3 }, rect)).toBe(true);
    expect(isInsideRect({ x: 5, y: 4 }, rect)).toBe(true);
    expect(isInsideRect({ x: 6, y: 4 }, rect)).toBe(false);
    expect(isInsideRect({ x: 5, y: 5 }, rect)).toBe(false);
    expect(isInsideRect({ x: 1, y: 3 }, rect)).toBe(false);
  });
});

describe('pixel conversions', () => {
  it('maps a tile to the centre of its pixels and back', () => {
    fc.assert(
      fc.property(tileArb, (tile: Tile) => {
        const pixel = tileCenterToPixel(tile);
        expect(pixel).toEqual({
          x: tile.x * TILE_SIZE + TILE_SIZE / 2,
          y: tile.y * TILE_SIZE + TILE_SIZE / 2,
        });
        expect(pixelToTile(pixel)).toEqual(tile);
      }),
    );
  });
});

describe('tileKey', () => {
  it('builds a stable key', () => {
    expect(tileKey({ x: 3, y: 7 })).toBe('3,7');
  });
});
