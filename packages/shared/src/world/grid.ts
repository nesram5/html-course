import type { WorldMap } from './map.js';

/** The part of a {@link WorldMap} needed to know whether a tile can be stepped on. */
export type CollisionGrid = Pick<WorldMap, 'width' | 'height' | 'collisionGrid'>;

export type CellState = 'walkable' | 'blocked' | 'out-of-bounds';

/**
 * State of a tile of the collision grid (row-major, `1` blocks, `0` is walkable).
 * Internal helper of `shared/world`: same rule as `isWalkable`, but it also says WHY a tile
 * cannot be stepped on, which `validateStep` reports.
 */
export function cellState(grid: CollisionGrid, x: number, y: number): CellState {
  if (!Number.isInteger(x) || !Number.isInteger(y)) return 'out-of-bounds';
  if (x < 0 || y < 0 || x >= grid.width || y >= grid.height) return 'out-of-bounds';
  return grid.collisionGrid[y * grid.width + x] === 0 ? 'walkable' : 'blocked';
}
