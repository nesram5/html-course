/**
 * Builds a template on a grid of tile NAMES: floor, walls, furniture, rooms, spawns and desks.
 * `build()` resolves walls (front face vs. top) and returns the Tiled layers as gids.
 */
import type { Tileset } from './tileset.js';

export interface RectObject {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface BuiltRoom extends RectObject {
  readonly areaId: string;
  readonly name: string;
}

export interface BuiltDesk extends RectObject {
  readonly deskId: string;
}

export interface BuiltMap {
  readonly width: number;
  readonly height: number;
  readonly floor: number[];
  readonly decorBelow: number[];
  readonly decorAbove: number[];
  readonly collision: number[];
  readonly rooms: BuiltRoom[];
  readonly spawns: { x: number; y: number }[];
  readonly desks: BuiltDesk[];
}

type FloorFill = string | ((x: number, y: number) => string);

export class MapBuilder {
  private readonly floor: string[];
  private readonly below: (string | null)[];
  private readonly above: (string | null)[];
  private readonly solid: Uint8Array;
  private readonly wall: Uint8Array;
  private readonly wallDecor = new Map<number, string>();
  private readonly rooms: BuiltRoom[] = [];
  private readonly spawns: { x: number; y: number }[] = [];
  private readonly desks: BuiltDesk[] = [];

  constructor(
    readonly width: number,
    readonly height: number,
    floor: FloorFill,
  ) {
    const size = width * height;
    this.floor = Array.from({ length: size }, (_, i) =>
      typeof floor === 'string' ? floor : floor(i % width, Math.floor(i / width)),
    );
    this.below = Array.from({ length: size }, () => null);
    this.above = Array.from({ length: size }, () => null);
    this.solid = new Uint8Array(size);
    this.wall = new Uint8Array(size);
  }

  private index(x: number, y: number): number {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) {
      throw new Error(
        `tile (${String(x)},${String(y)}) is outside the ${String(this.width)}x${String(this.height)} map`,
      );
    }
    return y * this.width + x;
  }

  isFree(x: number, y: number): boolean {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return false;
    const i = this.index(x, y);
    return this.solid[i] === 0 && this.wall[i] === 0 && this.below[i] === null;
  }

  isSolid(x: number, y: number): boolean {
    const i = this.index(x, y);
    return this.solid[i] === 1 || this.wall[i] === 1;
  }

  setFloor(x: number, y: number, w: number, h: number, fill: FloorFill): this {
    for (let yy = y; yy < y + h; yy++) {
      for (let xx = x; xx < x + w; xx++) {
        this.floor[this.index(xx, yy)] = typeof fill === 'string' ? fill : fill(xx, yy);
      }
    }
    return this;
  }

  /** Walls on the outline of a rectangle. */
  wallRect(x: number, y: number, w: number, h: number): this {
    this.wallLine(x, y, w, 1).wallLine(x, y + h - 1, w, 1);
    return this.wallLine(x, y, 1, h).wallLine(x + w - 1, y, 1, h);
  }

  /** A filled block of wall (use `w = 1` or `h = 1` for a line). */
  wallLine(x: number, y: number, w: number, h: number): this {
    for (let yy = y; yy < y + h; yy++) {
      for (let xx = x; xx < x + w; xx++) this.wall[this.index(xx, yy)] = 1;
    }
    return this;
  }

  /** Removes walls (doors). */
  opening(x: number, y: number, w: number, h: number): this {
    for (let yy = y; yy < y + h; yy++) {
      for (let xx = x; xx < x + w; xx++) this.wall[this.index(xx, yy)] = 0;
    }
    return this;
  }

  /** Decoration drawn on a wall tile when its front face is visible (window, art, whiteboard). */
  decorateWall(x: number, y: number, tile: string): this {
    this.wallDecor.set(this.index(x, y), tile);
    return this;
  }

  /** A single tile in the below (default) or above layer. */
  put(
    x: number,
    y: number,
    tile: string,
    options: { solid?: boolean; layer?: 'below' | 'above' } = {},
  ): this {
    const i = this.index(x, y);
    if (options.layer === 'above') this.above[i] = tile;
    else this.below[i] = tile;
    if (options.solid === true) this.solid[i] = 1;
    return this;
  }

  /** A composite object painted as `cols × rows` tiles named `<name>-<col>-<row>`. */
  object(x: number, y: number, name: string, cols: number, rows: number, solid = true): this {
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        this.put(x + col, y + row, `${name}-${String(col)}-${String(row)}`, { solid });
      }
    }
    return this;
  }

  /**
   * A 3-column composite stretched to `width` columns by repeating its middle column
   * (meeting tables), or a 3×3 one stretched in both directions (rugs).
   */
  private stretched(
    x: number,
    y: number,
    name: string,
    size: { w: number; h: number; rows: 2 | 3 },
    place: (x: number, y: number, tile: string) => void,
  ): this {
    for (let yy = 0; yy < size.h; yy++) {
      const row = size.rows === 2 ? yy : yy === 0 ? 0 : yy === size.h - 1 ? 2 : 1;
      for (let xx = 0; xx < size.w; xx++) {
        const col = xx === 0 ? 0 : xx === size.w - 1 ? 2 : 1;
        place(x + xx, y + yy, `${name}-${String(col)}-${String(row)}`);
      }
    }
    return this;
  }

  /** A rug: part of the floor layer (walkable), furniture can stand on it. */
  rug(x: number, y: number, w: number, h: number): this {
    return this.stretched(x, y, 'rug', { w, h, rows: 3 }, (tx, ty, tile) => {
      this.floor[this.index(tx, ty)] = tile;
    });
  }

  /** A meeting table of `w × 2` tiles. */
  table(x: number, y: number, w: number): this {
    return this.stretched(x, y, 'table', { w, h: 2, rows: 2 }, (tx, ty, tile) => {
      this.put(tx, ty, tile, { solid: true });
    });
  }

  /** 1×2 objects whose top half is drawn above the avatars (tall plants, lamps). */
  tall(x: number, y: number, name: 'plant-tall' | 'lamp'): this {
    this.put(x, y, `${name}-0-1`, { solid: true });
    return this.put(x, y - 1, `${name}-0-0`, { layer: 'above' });
  }

  /** A tree: blocking trunk, 3×3 canopy above the avatars. */
  tree(x: number, y: number): this {
    this.put(x, y, 'trunk', { solid: true });
    for (let row = 0; row < 3; row++) {
      for (let col = 0; col < 3; col++) {
        const cx = x - 1 + col;
        const cy = y - 2 + row;
        if (cx >= 0 && cy >= 0 && cx < this.width && cy < this.height) {
          this.put(cx, cy, `canopy-${String(col)}-${String(row)}`, { layer: 'above' });
        }
      }
    }
    return this;
  }

  /**
   * An assignable desk of 2 tiles with its chair. `chair: 'south'` puts the chair below the desk
   * (person faces north); `'north'` above it.
   */
  desk(x: number, y: number, deskId: string, chair: 'south' | 'north'): this {
    const side = chair === 'south' ? 's' : 'n';
    this.object(x, y, `desk-${side}`, 2, 1);
    const chairY = chair === 'south' ? y + 1 : y - 1;
    this.object(x, chairY, `seat-${side}`, 2, 1, false);
    this.desks.push({ x, y, width: 2, height: 1, deskId });
    return this;
  }

  /**
   * A pod of 4 desks facing each other: chairs on row `y`, desks on rows `y + 1` and `y + 2`,
   * chairs on row `y + 3`. Footprint 4×4 tiles.
   */
  pod(x: number, y: number, nextDeskId: () => string): this {
    this.desk(x, y + 1, nextDeskId(), 'north').desk(x + 2, y + 1, nextDeskId(), 'north');
    return this.desk(x, y + 2, nextDeskId(), 'south').desk(x + 2, y + 2, nextDeskId(), 'south');
  }

  room(x: number, y: number, w: number, h: number, areaId: string, name: string): this {
    this.rooms.push({ x, y, width: w, height: h, areaId, name });
    return this;
  }

  spawn(x: number, y: number): this {
    this.spawns.push({ x, y });
    return this;
  }

  build(tileset: Tileset): BuiltMap {
    const gidOrZero = (name: string | null) => (name === null ? 0 : tileset.gid(name));
    const decorBelow = this.below.map((tile, i) => {
      if (this.wall[i] === 0) return gidOrZero(tile);
      const y = Math.floor(i / this.width);
      const wallBelow = y + 1 >= this.height || this.wall[i + this.width] === 1;
      return tileset.gid(wallBelow ? 'wall-cap' : (this.wallDecor.get(i) ?? 'wall-face'));
    });
    return {
      width: this.width,
      height: this.height,
      floor: this.floor.map((tile) => tileset.gid(tile)),
      decorBelow,
      decorAbove: this.above.map(gidOrZero),
      collision: Array.from(this.solid, (solid, i) =>
        solid === 1 || this.wall[i] === 1 ? tileset.gid('collision') : 0,
      ),
      rooms: this.rooms,
      spawns: this.spawns,
      desks: this.desks,
    };
  }
}
