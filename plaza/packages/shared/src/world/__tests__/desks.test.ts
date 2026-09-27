import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { DESK_DECOR_SLOTS } from '../../constants.js';
import { DeskDecorSchema } from '../../contracts/http/common.js';
import { deskSpawnCandidates, deskSpawnTile, validateDeskDecor } from '../desks.js';
import { isAdjacent, isInsideRect } from '../geometry.js';
import type { DeskArea } from '../map.js';
import { gridMap } from './grid-fixture.js';

const CATALOG = new Set(['plant', 'lamp', 'mug', 'frame', 'trophy', 'cat']);

describe('validateDeskDecor (E9-S3, RN-15)', () => {
  it('accepts up to 3 catalog items and empty slots', () => {
    expect(validateDeskDecor({ slots: ['plant', null, 'lamp'] }, CATALOG)).toEqual({
      ok: true,
      decor: { slots: ['plant', null, 'lamp'] },
    });
    expect(validateDeskDecor({ slots: [null, null, null] }, CATALOG)).toEqual({
      ok: true,
      decor: { slots: [null, null, null] },
    });
  });

  it('allows the same item in several slots', () => {
    expect(validateDeskDecor({ slots: ['mug', 'mug', 'mug'] }, CATALOG).ok).toBe(true);
  });

  it('pads a shorter list to exactly 3 slots', () => {
    expect(validateDeskDecor({ slots: ['plant'] }, CATALOG)).toEqual({
      ok: true,
      decor: { slots: ['plant', null, null] },
    });
    expect(validateDeskDecor({ slots: [] }, CATALOG)).toEqual({
      ok: true,
      decor: { slots: [null, null, null] },
    });
  });

  it('rejects more than 3 items with VALIDATION_ERROR', () => {
    expect(validateDeskDecor({ slots: ['plant', 'lamp', 'mug', 'cat'] }, CATALOG)).toEqual({
      ok: false,
      reason: 'too-many-items',
      code: 'VALIDATION_ERROR',
    });
    expect(validateDeskDecor({ slots: [null, null, null, null] }, CATALOG)).toMatchObject({
      ok: false,
      reason: 'too-many-items',
    });
  });

  it('rejects an item outside the catalog with UNKNOWN_DECOR_ITEM', () => {
    expect(validateDeskDecor({ slots: ['plant', 'unicorn', null] }, CATALOG)).toEqual({
      ok: false,
      reason: 'unknown-item',
      code: 'UNKNOWN_DECOR_ITEM',
      itemId: 'unicorn',
    });
    expect(validateDeskDecor({ slots: ['plant'] }, new Set())).toMatchObject({
      ok: false,
      itemId: 'plant',
    });
  });

  it('property: every accepted decoration is a valid DeskDecor made of catalog items', () => {
    const slotArb = fc.option(fc.constantFrom(...CATALOG, 'unicorn', 'x'), { nil: null });
    fc.assert(
      fc.property(fc.array(slotArb, { maxLength: 5 }), (slots) => {
        const result = validateDeskDecor({ slots }, CATALOG);
        const valid =
          slots.length <= DESK_DECOR_SLOTS && slots.every((s) => s === null || CATALOG.has(s));
        expect(result.ok).toBe(valid);
        if (result.ok) {
          expect(DeskDecorSchema.parse(result.decor)).toEqual(result.decor);
          expect(result.decor.slots.slice(0, slots.length)).toEqual(slots);
        }
      }),
    );
  });
});

describe('deskSpawnCandidates / deskSpawnTile (E9-S2)', () => {
  const desk = (x: number, y: number, width: number, height: number): DeskArea => ({
    deskId: 'desk-1',
    x,
    y,
    width,
    height,
    decorSlots: [],
  });

  it('prefers the tile in front of (below) the desk, closest to its middle', () => {
    const map = gridMap([
      '.......', //
      '..###..',
      '.......',
      '.......',
    ]);
    const rect = desk(2, 1, 3, 1);
    expect(deskSpawnTile(map, rect)).toEqual({ x: 3, y: 2 });
    expect(deskSpawnCandidates(map, rect)).toEqual([
      { x: 3, y: 2 },
      { x: 2, y: 2 },
      { x: 4, y: 2 },
      { x: 1, y: 1 },
      { x: 5, y: 1 },
      { x: 3, y: 0 },
      { x: 2, y: 0 },
      { x: 4, y: 0 },
    ]);
  });

  it('falls back to the sides and then the back when the front is blocked', () => {
    const map = gridMap([
      '.....', //
      '.###.',
      '#####',
    ]);
    const rect = desk(1, 1, 3, 1);
    expect(deskSpawnTile(map, rect)).toEqual({ x: 0, y: 1 });

    const walledSides = gridMap([
      '.....', //
      '#####',
      '#####',
    ]);
    expect(deskSpawnTile(walledSides, rect)).toEqual({ x: 2, y: 0 });
  });

  it('skips tiles outside the map and inside meeting rooms', () => {
    // Desk in the top-left corner; the tile below it belongs to a meeting room.
    const map = gridMap(['##..', '##..', '....'], {
      rooms: [{ areaId: 'sala-1', name: 'Sala 1', x: 0, y: 2, width: 2, height: 1 }],
    });
    const candidates = deskSpawnCandidates(map, desk(0, 0, 2, 2));
    expect(candidates).toEqual([
      { x: 2, y: 0 },
      { x: 2, y: 1 },
    ]);
  });

  it('returns null when the desk is walled in', () => {
    const map = gridMap(['###', '###', '###']);
    expect(deskSpawnTile(map, desk(1, 1, 1, 1))).toBeNull();
  });

  it('property: every candidate is walkable, outside the desk and next to it', () => {
    const cellArb = fc.constantFrom('.', '.', '#');
    const mapArb = fc.array(fc.array(cellArb, { minLength: 8, maxLength: 8 }), {
      minLength: 8,
      maxLength: 8,
    });
    const rectArb = fc.record({
      x: fc.integer({ min: 0, max: 6 }),
      y: fc.integer({ min: 0, max: 6 }),
      width: fc.integer({ min: 1, max: 2 }),
      height: fc.integer({ min: 1, max: 2 }),
    });
    fc.assert(
      fc.property(mapArb, rectArb, (rows, r) => {
        const map = gridMap(rows.map((row) => row.join('')));
        const rect = desk(r.x, r.y, r.width, r.height);
        const deskTiles = [];
        for (let y = rect.y; y < rect.y + rect.height; y++) {
          for (let x = rect.x; x < rect.x + rect.width; x++) deskTiles.push({ x, y });
        }
        for (const tile of deskSpawnCandidates(map, rect)) {
          expect(isInsideRect(tile, rect)).toBe(false);
          expect(map.collisionGrid[tile.y * map.width + tile.x]).toBe(0);
          expect(deskTiles.some((d) => isAdjacent(d, tile))).toBe(true);
        }
      }),
    );
  });
});
