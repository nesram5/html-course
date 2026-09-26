import { DESK_DECOR_SLOTS, TILE_SIZE } from '../constants.js';
import { SlugIdSchema } from '../contracts/http/common.js';
import type { Tile, TileRect } from './geometry.js';
import {
  TiledMapSchema,
  TiledObjectLayerSchema,
  TiledTileLayerSchema,
  tiledProperty,
  type TiledMap,
  type TiledObject,
  type TiledObjectLayer,
  type TiledTileLayer,
} from './tiled.js';

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

/** Tile layers every map needs (architecture §8). */
export const REQUIRED_TILE_LAYERS = ['floor', 'collision'] as const;
/** Object layers every map needs (architecture §8). */
export const REQUIRED_OBJECT_LAYERS = ['rooms', 'spawns', 'desks'] as const;
/** Art-only tile layers: `pnpm validate:maps` requires them, `parseMap` does not read them. */
export const DECOR_TILE_LAYERS = ['decor-below', 'decor-above'] as const;

/** Thrown by {@link parseMap}; `problems` lists every issue found, one sentence each. */
export class MapParseError extends Error {
  constructor(readonly problems: readonly string[]) {
    super(`invalid map:\n${problems.map((problem) => `  - ${problem}`).join('\n')}`);
    this.name = 'MapParseError';
  }
}

/**
 * Room lookup index per map: `width * height` cells with `0` in the hallway and `i + 1` inside
 * `rooms[i]`. Kept outside `WorldMap` so the domain model stays a plain value; built by
 * `parseMap` and lazily by `roomAt` for maps created by hand.
 */
const roomIndexCache = new WeakMap<WorldMap, Uint16Array>();

function buildRoomIndex(map: WorldMap): Uint16Array {
  const index = new Uint16Array(map.width * map.height);
  map.rooms.forEach((room, i) => {
    const x0 = Math.max(0, room.x);
    const y0 = Math.max(0, room.y);
    const x1 = Math.min(map.width, room.x + room.width);
    const y1 = Math.min(map.height, room.y + room.height);
    for (let y = y0; y < y1; y++) index.fill(i + 1, y * map.width + x0, y * map.width + x1);
  });
  return index;
}

function roomIndexOf(map: WorldMap): Uint16Array {
  let index = roomIndexCache.get(map);
  if (index === undefined) {
    index = buildRoomIndex(map);
    roomIndexCache.set(map, index);
  }
  return index;
}

function isInBounds(map: Pick<WorldMap, 'width' | 'height'>, x: number, y: number): boolean {
  return (
    Number.isInteger(x) &&
    Number.isInteger(y) &&
    x >= 0 &&
    y >= 0 &&
    x < map.width &&
    y < map.height
  );
}

/** `false` for tiles with a collision tile or out of bounds. */
export function isWalkable(map: WorldMap, x: number, y: number): boolean {
  return isInBounds(map, x, y) && map.collisionGrid[y * map.width + x] === 0;
}

/** `areaId` of the meeting room containing the tile, or `null` in the hallway. O(1). */
export function roomAt(map: WorldMap, x: number, y: number): string | null {
  if (!isInBounds(map, x, y)) return null;
  const slot = roomIndexOf(map)[y * map.width + x] ?? 0;
  return slot === 0 ? null : (map.rooms[slot - 1]?.areaId ?? null);
}

/** Pixel positions of the decoration slots of a desk: evenly spread along its middle line. */
export function deskDecorSlots(desk: TileRect, tileSize: number = TILE_SIZE): PixelPoint[] {
  const left = desk.x * tileSize;
  const width = desk.width * tileSize;
  const y = desk.y * tileSize + Math.round((desk.height * tileSize) / 2);
  return Array.from({ length: DESK_DECOR_SLOTS }, (_, i) => ({
    x: left + Math.round((width * (i + 1)) / (DESK_DECOR_SLOTS + 1)),
    y,
  }));
}

// ── Parsing ─────────────────────────────────────────────────────────────────

function formatZodIssues(
  prefix: string,
  error: { issues: readonly { path: readonly PropertyKey[]; message: string }[] },
): string[] {
  return error.issues.map((issue) => {
    const path = issue.path.map(String).join('.');
    return `${prefix}${path === '' ? '' : ` (${path})`}: ${issue.message}`;
  });
}

interface ParseContext {
  readonly tmj: TiledMap;
  readonly problems: string[];
}

function findLayer(ctx: ParseContext, name: string): unknown {
  const matches = ctx.tmj.layers.filter(
    (layer) =>
      typeof layer === 'object' && layer !== null && 'name' in layer && layer.name === name,
  );
  if (matches.length === 0) {
    ctx.problems.push(`missing layer "${name}"`);
    return undefined;
  }
  if (matches.length > 1)
    ctx.problems.push(`layer "${name}" appears ${String(matches.length)} times`);
  return matches[0];
}

function tileLayer(ctx: ParseContext, name: string): TiledTileLayer | undefined {
  const raw = findLayer(ctx, name);
  if (raw === undefined) return undefined;
  const parsed = TiledTileLayerSchema.safeParse(raw);
  if (!parsed.success) {
    ctx.problems.push(
      ...formatZodIssues(`layer "${name}" must be an uncompressed tile layer`, parsed.error),
    );
    return undefined;
  }
  const layer = parsed.data;
  const { width, height } = ctx.tmj;
  if (layer.width !== width || layer.height !== height) {
    ctx.problems.push(
      `layer "${name}" is ${String(layer.width)}x${String(layer.height)}, the map is ${String(width)}x${String(height)}`,
    );
    return undefined;
  }
  if (layer.data.length !== width * height) {
    ctx.problems.push(
      `layer "${name}" has ${String(layer.data.length)} tiles, expected ${String(width * height)}`,
    );
    return undefined;
  }
  return layer;
}

function objectLayer(ctx: ParseContext, name: string): TiledObjectLayer | undefined {
  const raw = findLayer(ctx, name);
  if (raw === undefined) return undefined;
  const parsed = TiledObjectLayerSchema.safeParse(raw);
  if (!parsed.success) {
    ctx.problems.push(...formatZodIssues(`layer "${name}" must be an object layer`, parsed.error));
    return undefined;
  }
  return parsed.data;
}

function describe(layer: string, object: TiledObject): string {
  const label = object.name !== undefined && object.name !== '' ? ` "${object.name}"` : '';
  return `${layer}: object ${String(object.id)}${label}`;
}

function shapeOf(object: TiledObject): string {
  if (object.point === true) return 'a point';
  if (object.ellipse === true) return 'an ellipse';
  if (object.polygon !== undefined) return 'a polygon';
  if (object.polyline !== undefined) return 'a polyline';
  if (object.text !== undefined) return 'a text';
  if (object.gid !== undefined) return 'a tile object';
  return 'a rectangle';
}

/** Converts a Tiled rectangle to a tile-aligned rectangle inside the map, or reports why not. */
function tileRect(ctx: ParseContext, layer: string, object: TiledObject): TileRect | undefined {
  const where = describe(layer, object);
  const shape = shapeOf(object);
  if (shape !== 'a rectangle') {
    ctx.problems.push(`${where} must be a rectangle, found ${shape}`);
    return undefined;
  }
  if ((object.rotation ?? 0) !== 0) {
    ctx.problems.push(`${where} must not be rotated`);
    return undefined;
  }
  const { tilewidth, tileheight, width: mapWidth, height: mapHeight } = ctx.tmj;
  const width = object.width ?? 0;
  const height = object.height ?? 0;
  const aligned =
    object.x % tilewidth === 0 &&
    object.y % tileheight === 0 &&
    width % tilewidth === 0 &&
    height % tileheight === 0;
  if (width === 0 || height === 0 || !aligned) {
    ctx.problems.push(
      `${where} must cover whole tiles (snap it to the ${String(tilewidth)}px grid)`,
    );
    return undefined;
  }
  const rect = {
    x: object.x / tilewidth,
    y: object.y / tileheight,
    width: width / tilewidth,
    height: height / tileheight,
  };
  if (
    rect.x < 0 ||
    rect.y < 0 ||
    rect.x + rect.width > mapWidth ||
    rect.y + rect.height > mapHeight
  ) {
    ctx.problems.push(`${where} lies outside the map`);
    return undefined;
  }
  return rect;
}

function slugProperty(
  ctx: ParseContext,
  where: string,
  object: TiledObject,
  name: string,
): string | undefined {
  const value = tiledProperty(object, name);
  if (value === undefined) {
    ctx.problems.push(`${where} needs the property "${name}"`);
    return undefined;
  }
  const parsed = SlugIdSchema.safeParse(value);
  if (!parsed.success) {
    ctx.problems.push(
      `${where}: property "${name}" must be lowercase letters, digits, "-" or "_" (got ${JSON.stringify(value)})`,
    );
    return undefined;
  }
  return parsed.data;
}

function rectsOverlap(a: TileRect, b: TileRect): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

function parseRooms(ctx: ParseContext, layer: TiledObjectLayer): RoomArea[] {
  const rooms: RoomArea[] = [];
  for (const object of layer.objects) {
    const where = describe('rooms', object);
    const rect = tileRect(ctx, 'rooms', object);
    const areaId = slugProperty(ctx, where, object, 'areaId');
    const name = tiledProperty(object, 'name') ?? object.name;
    if (typeof name !== 'string' || name.trim() === '') {
      ctx.problems.push(`${where} needs a non-empty "name" property`);
      continue;
    }
    if (rect === undefined || areaId === undefined) continue;
    if (rooms.some((room) => room.areaId === areaId)) {
      ctx.problems.push(`${where}: duplicate areaId "${areaId}"`);
      continue;
    }
    const overlapped = rooms.find((room) => rectsOverlap(room, rect));
    if (overlapped !== undefined) {
      ctx.problems.push(`${where} overlaps room "${overlapped.areaId}"`);
      continue;
    }
    rooms.push({ ...rect, areaId, name: name.trim() });
  }
  return rooms;
}

function parseSpawns(
  ctx: ParseContext,
  layer: TiledObjectLayer,
  collision: Uint8Array | undefined,
): Tile[] {
  const spawns: Tile[] = [];
  const { width, height, tilewidth, tileheight } = ctx.tmj;
  for (const object of layer.objects) {
    const where = describe('spawns', object);
    if (object.point !== true) {
      ctx.problems.push(`${where} must be a point, found ${shapeOf(object)}`);
      continue;
    }
    const tile = { x: Math.floor(object.x / tilewidth), y: Math.floor(object.y / tileheight) };
    if (!isInBounds({ width, height }, tile.x, tile.y)) {
      ctx.problems.push(`${where} lies outside the map`);
      continue;
    }
    if (collision !== undefined && collision[tile.y * width + tile.x] !== 0) {
      ctx.problems.push(`${where} is on a blocked tile (${String(tile.x)},${String(tile.y)})`);
      continue;
    }
    spawns.push(tile);
  }
  if (layer.objects.length === 0)
    ctx.problems.push('spawns: the map needs at least one spawn point');
  return spawns;
}

function parseDesks(ctx: ParseContext, layer: TiledObjectLayer): DeskArea[] {
  const desks: DeskArea[] = [];
  for (const object of layer.objects) {
    const where = describe('desks', object);
    const rect = tileRect(ctx, 'desks', object);
    const deskId = slugProperty(ctx, where, object, 'deskId');
    if (rect === undefined || deskId === undefined) continue;
    if (desks.some((desk) => desk.deskId === deskId)) {
      ctx.problems.push(`${where}: duplicate deskId "${deskId}"`);
      continue;
    }
    desks.push({ ...rect, deskId, decorSlots: deskDecorSlots(rect, ctx.tmj.tilewidth) });
  }
  return desks;
}

/**
 * Parses a Tiled JSON map (`.tmj`) into a {@link WorldMap}.
 * Validates the required layers (`floor`, `collision`, `rooms` with tile-aligned rectangles and
 * `areaId`/`name`, `spawns` as points on walkable tiles, `desks` with unique `deskId`) and throws
 * a {@link MapParseError} listing every problem, which `pnpm validate:maps` reports.
 */
export function parseMap(tmj: unknown): WorldMap {
  const parsed = TiledMapSchema.safeParse(tmj);
  if (!parsed.success)
    throw new MapParseError(formatZodIssues('not a finite orthogonal Tiled map', parsed.error));
  const ctx: ParseContext = { tmj: parsed.data, problems: [] };
  const { width, height, tilewidth, tileheight } = ctx.tmj;
  if (tilewidth !== TILE_SIZE || tileheight !== TILE_SIZE) {
    ctx.problems.push(
      `tiles must be ${String(TILE_SIZE)}x${String(TILE_SIZE)} px, found ${String(tilewidth)}x${String(tileheight)}`,
    );
    throw new MapParseError(ctx.problems);
  }

  tileLayer(ctx, 'floor');
  const collisionLayer = tileLayer(ctx, 'collision');
  const collisionGrid =
    collisionLayer === undefined
      ? undefined
      : Uint8Array.from(collisionLayer.data, (gid) => (gid === 0 ? 0 : 1));
  const roomsLayer = objectLayer(ctx, 'rooms');
  const spawnsLayer = objectLayer(ctx, 'spawns');
  const desksLayer = objectLayer(ctx, 'desks');

  const rooms = roomsLayer === undefined ? [] : parseRooms(ctx, roomsLayer);
  const spawns = spawnsLayer === undefined ? [] : parseSpawns(ctx, spawnsLayer, collisionGrid);
  const desks = desksLayer === undefined ? [] : parseDesks(ctx, desksLayer);

  if (ctx.problems.length > 0 || collisionGrid === undefined) throw new MapParseError(ctx.problems);

  const map: WorldMap = { width, height, collisionGrid, rooms, spawns, desks };
  roomIndexCache.set(map, buildRoomIndex(map));
  return map;
}

/** Every tile covered by a rectangle, row by row. */
export function tilesOf(rect: TileRect): Tile[] {
  const tiles: Tile[] = [];
  for (let y = rect.y; y < rect.y + rect.height; y++) {
    for (let x = rect.x; x < rect.x + rect.width; x++) tiles.push({ x, y });
  }
  return tiles;
}
