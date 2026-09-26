import type { Tile, TileRect } from './geometry.js';
import { NotImplementedError } from './not-implemented.js';

/** A meeting room: rectangle of the `rooms` object layer (architecture §8). */
export interface RoomArea extends TileRect {
  readonly areaId: string;
  readonly name: string;
}

/** A position in map pixels (Tiled object coordinates). */
export interface PixelPoint {
  readonly x: number;
  readonly y: number;
}

/** An assignable desk: rectangle of the `desks` object layer over blocking furniture (E9-S2). */
export interface DeskArea extends TileRect {
  readonly deskId: string;
  /**
   * Positions of the 3 decoration slots in map PIXELS (not tiles: items sit inside a desk tile),
   * in slot order (E9-S3).
   */
  readonly decorSlots: readonly PixelPoint[];
}

/** Domain model of a Tiled map, shared by client and server (architecture §8). */
export interface WorldMap {
  /** Size in tiles. */
  readonly width: number;
  readonly height: number;
  /** `width * height` cells, row-major; `1` blocks, `0` is walkable. */
  readonly collisionGrid: Uint8Array;
  readonly rooms: readonly RoomArea[];
  readonly spawns: readonly Tile[];
  readonly desks: readonly DeskArea[];
}

/**
 * Parses a Tiled JSON map (`.tmj`) into a {@link WorldMap}.
 * Must validate the required layers (`floor`, `collision`, `rooms` with rectangles only and
 * `areaId`/`name`, `spawns`, `desks` with unique `deskId`) and throw a descriptive error, which
 * `pnpm validate:maps` reports.
 *
 * TODO(E3-S1): implement with a minimal zod schema of the Tiled format.
 */
export function parseMap(_tmj: unknown): WorldMap {
  throw new NotImplementedError('parseMap', 'E3-S1');
}

/**
 * `false` for tiles with a collision tile or out of bounds.
 *
 * TODO(E3-S1): implement.
 */
export function isWalkable(_map: WorldMap, _x: number, _y: number): boolean {
  throw new NotImplementedError('isWalkable', 'E3-S1');
}

/**
 * `areaId` of the meeting room containing the tile, or `null` in the hallway.
 *
 * TODO(E3-S1): implement.
 */
export function roomAt(_map: WorldMap, _x: number, _y: number): string | null {
  throw new NotImplementedError('roomAt', 'E3-S1');
}
