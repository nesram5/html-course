import { DESK_DECOR_SLOTS } from '../constants.js';
import type { DeskDecor } from '../contracts/http/common.js';
import { isInsideRect, type Tile, type TileRect } from './geometry.js';
import { cellState } from './grid.js';
import type { WorldMap } from './map.js';

export type DeskDecorRejection = 'too-many-items' | 'unknown-item';

export type DeskDecorValidation =
  | { ok: true; decor: DeskDecor }
  | {
      ok: false;
      reason: DeskDecorRejection;
      /** Error code the server answers with (both are `400`, RN-15). */
      code: 'VALIDATION_ERROR' | 'UNKNOWN_DECOR_ITEM';
      /** The offending item for `unknown-item`. */
      itemId?: string;
    };

/**
 * Validates the decoration of a desk against the catalog (E9-S3, RN-15): at most
 * {@link DESK_DECOR_SLOTS} slots and every non-empty slot an item id of the catalog.
 * The same item may appear in several slots. A shorter list is padded with empty slots, so a
 * valid result always has exactly {@link DESK_DECOR_SLOTS} slots.
 */
export function validateDeskDecor(
  decor: { readonly slots: readonly (string | null)[] },
  catalogIds: ReadonlySet<string>,
): DeskDecorValidation {
  if (decor.slots.length > DESK_DECOR_SLOTS) {
    return { ok: false, reason: 'too-many-items', code: 'VALIDATION_ERROR' };
  }
  for (const itemId of decor.slots) {
    if (itemId !== null && !catalogIds.has(itemId)) {
      return { ok: false, reason: 'unknown-item', code: 'UNKNOWN_DECOR_ITEM', itemId };
    }
  }
  const slots = Array.from({ length: DESK_DECOR_SLOTS }, (_, i) => decor.slots[i] ?? null);
  return { ok: true, decor: { slots } };
}

/** What {@link deskSpawnCandidates} needs from the map. */
export type DeskSpawnMap = Pick<WorldMap, 'width' | 'height' | 'collisionGrid' | 'rooms'>;

function byDistanceToCentre(center: number, axis: 'x' | 'y') {
  return (a: Tile, b: Tile): number =>
    Math.abs(a[axis] - center) - Math.abs(b[axis] - center) || a[axis] - b[axis];
}

/**
 * Walkable tiles next to a desk rectangle (4-neighbourhood of its border, outside it and outside
 * any meeting room), in order of preference: in front of the desk (the row below it), then its
 * left side, its right side and the row above; within a side, closest to the middle first.
 * Used to place a person next to their desk when entering the space and for "Mi escritorio"
 * (E9-S2): the server accepts exactly these tiles as a spawn.
 */
export function deskSpawnCandidates(map: DeskSpawnMap, desk: TileRect): Tile[] {
  const xs = Array.from({ length: desk.width }, (_, i) => desk.x + i);
  const ys = Array.from({ length: desk.height }, (_, i) => desk.y + i);
  const centreX = desk.x + (desk.width - 1) / 2;
  const centreY = desk.y + (desk.height - 1) / 2;

  const below = xs
    .map((x) => ({ x, y: desk.y + desk.height }))
    .sort(byDistanceToCentre(centreX, 'x'));
  const left = ys.map((y) => ({ x: desk.x - 1, y })).sort(byDistanceToCentre(centreY, 'y'));
  const right = ys
    .map((y) => ({ x: desk.x + desk.width, y }))
    .sort(byDistanceToCentre(centreY, 'y'));
  const above = xs.map((x) => ({ x, y: desk.y - 1 })).sort(byDistanceToCentre(centreX, 'x'));

  return [...below, ...left, ...right, ...above].filter(
    (tile) =>
      cellState(map, tile.x, tile.y) === 'walkable' &&
      !map.rooms.some((room) => isInsideRect(tile, room)),
  );
}

/** Preferred tile to spawn next to a desk, or `null` when it is walled in (use a map spawn). */
export function deskSpawnTile(map: DeskSpawnMap, desk: TileRect): Tile | null {
  return deskSpawnCandidates(map, desk)[0] ?? null;
}

/** Distance in tiles from a coordinate to a span `[start, start + size)` (0 inside it). */
function axisGap(value: number, start: number, size: number): number {
  if (value < start) return start - value;
  if (value >= start + size) return value - (start + size - 1);
  return 0;
}

/**
 * The desk a person standing on `tile` can interact with (`X` → "Reclamar este escritorio",
 * "Decorar", E9-S2): a desk touching the tile, diagonals included. When several do, one sharing
 * a side with the tile wins over one touching only by a corner, then the first in map order.
 * `null` when no desk is next to the tile.
 */
export function deskNear<D extends TileRect>(desks: readonly D[], tile: Tile): D | null {
  let best: D | null = null;
  let bestScore = Number.POSITIVE_INFINITY;
  for (const desk of desks) {
    const dx = axisGap(tile.x, desk.x, desk.width);
    const dy = axisGap(tile.y, desk.y, desk.height);
    if (Math.max(dx, dy) > 1) continue;
    const score = dx + dy;
    if (score < bestScore) {
      best = desk;
      bestScore = score;
    }
  }
  return best;
}
