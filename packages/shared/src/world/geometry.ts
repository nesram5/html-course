import { TILE_SIZE } from '../constants.js';
import type { Direction } from '../contracts/realtime/player.js';

/** A tile position on the map grid. */
export interface Tile {
  readonly x: number;
  readonly y: number;
}

/** An axis-aligned rectangle in tiles (rooms and desks, ADR-006). */
export interface TileRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export const DIRECTIONS = ['up', 'down', 'left', 'right'] as const satisfies readonly Direction[];

/** Unit vector of each direction. `y` grows downwards, like screen coordinates. */
export const DIRECTION_VECTORS: Readonly<Record<Direction, Tile>> = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};

/** Euclidean distance between two tiles, used by proximity (RN-01). */
export function distance(a: Tile, b: Tile): number {
  return Math.sqrt(distanceSquared(a, b));
}

/** Squared euclidean distance: cheaper when only comparing distances. */
export function distanceSquared(a: Tile, b: Tile): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}

/** `true` when `b` is exactly one step away from `a` (4-neighbourhood, no diagonals). */
export function isAdjacent(a: Tile, b: Tile): boolean {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y) === 1;
}

export function isSameTile(a: Tile, b: Tile): boolean {
  return a.x === b.x && a.y === b.y;
}

/** The tile one step from `tile` towards `dir`. */
export function stepTowards(tile: Tile, dir: Direction): Tile {
  const vector = DIRECTION_VECTORS[dir];
  return { x: tile.x + vector.x, y: tile.y + vector.y };
}

/** Direction of a single step from `from` to `to`, or `null` if they are not adjacent. */
export function directionBetween(from: Tile, to: Tile): Direction | null {
  if (!isAdjacent(from, to)) return null;
  if (to.x > from.x) return 'right';
  if (to.x < from.x) return 'left';
  return to.y > from.y ? 'down' : 'up';
}

/** `true` when the tile lies inside the rectangle (inclusive start, exclusive end). */
export function isInsideRect(tile: Tile, rect: TileRect): boolean {
  return (
    tile.x >= rect.x &&
    tile.y >= rect.y &&
    tile.x < rect.x + rect.width &&
    tile.y < rect.y + rect.height
  );
}

/** Pixel coordinates of the centre of a tile. */
export function tileCenterToPixel(tile: Tile, tileSize: number = TILE_SIZE): Tile {
  return { x: tile.x * tileSize + tileSize / 2, y: tile.y * tileSize + tileSize / 2 };
}

/** Tile that contains a pixel position. */
export function pixelToTile(pixel: Tile, tileSize: number = TILE_SIZE): Tile {
  return { x: Math.floor(pixel.x / tileSize), y: Math.floor(pixel.y / tileSize) };
}

/** Stable string key of a tile, handy for sets and maps. */
export function tileKey(tile: Tile): string {
  return `${String(tile.x)},${String(tile.y)}`;
}
