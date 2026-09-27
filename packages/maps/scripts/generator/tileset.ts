/**
 * The "pixel office" tileset: every 32×32 tile the templates use, painted procedurally.
 * Floors are opaque; furniture and walls-art are transparent and drawn over a floor tile.
 * Multi-tile objects are painted as one picture and sliced into `<name>-<col>-<row>` tiles.
 */
import { P } from './palette.js';
import { Raster, hash2, mix } from './raster.js';

export const TILE = 32;
export const TILESET_COLUMNS = 8;

export interface Tileset {
  readonly names: readonly string[];
  readonly tiles: readonly Raster[];
  /** Global tile id (Tiled `gid`, 1-based) of a tile name. */
  gid(name: string): number;
  /** Tile raster by gid. */
  tile(gid: number): Raster;
  /** All tiles in a `TILESET_COLUMNS`-wide image. */
  image(): Raster;
}

type Painter = (r: Raster) => void;

// ── Floors ──────────────────────────────────────────────────────────────────

function wood(variant: number): Painter {
  return (r) => {
    const tones = [P.woodA, P.woodB, P.woodC];
    for (let plank = 0; plank < 4; plank++) {
      const y = plank * 8;
      const tone = tones[Math.floor(hash2(plank, variant, 7) * 3)] ?? P.woodA;
      r.rect(0, y, TILE, 8, tone);
      r.hline(0, y + 7, TILE, P.woodSeam);
      const seam = Math.floor(hash2(plank, variant, 3) * 24) + 4;
      r.vline(seam, y, 7, P.woodSeam);
      const grain = Math.floor(hash2(plank, variant, 5) * 20) + 6;
      r.hline(grain, y + 3, 5, P.woodGrain);
    }
  };
}

function kitchenTiles(): Painter {
  return (r) => {
    for (let ty = 0; ty < 2; ty++) {
      for (let tx = 0; tx < 2; tx++) {
        r.rect(tx * 16, ty * 16, 16, 16, (tx + ty) % 2 === 0 ? P.tileA : P.tileB);
      }
    }
    r.hline(0, 15, TILE, P.tileGrout);
    r.hline(0, 31, TILE, P.tileGrout);
    r.vline(15, 0, TILE, P.tileGrout);
    r.vline(31, 0, TILE, P.tileGrout);
  };
}

function carpet(tones: readonly string[]): Painter {
  const [base = '#999999', dark = '#888888', light = '#aaaaaa'] = tones;
  return (r) => {
    r.rect(0, 0, TILE, TILE, base);
    for (let y = 0; y < TILE; y += 8) {
      for (let x = (y / 8) % 2 === 0 ? 0 : 4; x < TILE; x += 8) {
        r.px(x + 2, y + 3, dark);
        r.px(x + 3, y + 3, light);
      }
    }
  };
}

function grass(variant: number): Painter {
  return (r) => {
    r.rect(0, 0, TILE, TILE, variant === 1 ? P.grassB : P.grassA);
    for (let i = 0; i < 14; i++) {
      const x = Math.floor(hash2(i, variant, 11) * 30) + 1;
      const y = Math.floor(hash2(i, variant, 13) * 29) + 2;
      r.px(x, y, P.grassBlade);
      r.px(x, y - 1, P.grassBlade);
      r.px(x + 1, y - 2, P.grassLight);
    }
    if (variant === 2) {
      const flowers = [P.flowerPink, P.flowerYellow, P.flowerWhite];
      for (let i = 0; i < 4; i++) {
        const x = Math.floor(hash2(i, 5, 17) * 26) + 3;
        const y = Math.floor(hash2(i, 5, 19) * 26) + 3;
        const color = flowers[i % 3] ?? P.flowerWhite;
        r.px(x, y - 1, color);
        r.px(x - 1, y, color);
        r.px(x + 1, y, color);
        r.px(x, y + 1, color);
        r.px(x, y, P.flowerYellow);
      }
    }
  };
}

function path(variant: number): Painter {
  return (r) => {
    r.rect(0, 0, TILE, TILE, P.pathEdge);
    const stones =
      variant === 0
        ? [
            [1, 1, 14, 14],
            [17, 1, 14, 14],
            [1, 17, 14, 14],
            [17, 17, 14, 14],
          ]
        : [
            [1, 1, 20, 14],
            [23, 1, 8, 14],
            [1, 17, 9, 14],
            [12, 17, 19, 14],
          ];
    stones.forEach(([x = 0, y = 0, w = 0, h = 0], i) => {
      r.roundRect(x, y, w, h, i % 2 === 0 ? P.pathA : P.pathB, 1);
      r.hline(x + 1, y, w - 2, mix(P.pathA, '#ffffff', 0.35));
    });
  };
}

function doorMat(): Painter {
  return (r) => {
    wood(0)(r);
    r.rect(0, 6, TILE, 20, P.mat);
    for (let y = 9; y < 24; y += 3) r.hline(0, y, TILE, P.matLight);
  };
}

// ── Walls ───────────────────────────────────────────────────────────────────

function wallCap(): Painter {
  return (r) => {
    r.rect(0, 0, TILE, TILE, P.wallCap);
  };
}

/** Front face of a wall (seen from the south), with an optional decoration. */
function wallFace(decorate?: Painter): Painter {
  return (r) => {
    r.rect(0, 0, TILE, 7, P.wallCap);
    r.hline(0, 0, TILE, P.wallCapLight);
    r.rect(0, 7, TILE, 25, P.wallFace);
    for (let x = 2; x < TILE; x += 6) r.vline(x, 8, 19, P.wallStripe);
    r.hline(0, 7, TILE, mix(P.wallFace, '#ffffff', 0.4));
    r.rect(0, 27, TILE, 5, P.wallBase);
    r.hline(0, 31, TILE, P.wallBaseDark);
    decorate?.(r);
  };
}

const windowDecor: Painter = (r) => {
  r.rect(5, 10, 22, 15, P.frame);
  r.rect(7, 12, 18, 11, P.glass);
  r.vline(15, 12, 11, P.frame);
  r.vline(16, 12, 11, P.frame);
  for (let i = 0; i < 5; i++) r.px(9 + i, 21 - i, P.glassLight);
  r.hline(4, 25, 24, P.wallBase);
};

const artDecor: Painter = (r) => {
  r.rect(8, 10, 16, 13, P.shelfWood);
  r.rect(10, 12, 12, 9, '#f4e1c1');
  r.ellipse(11, 13, 6, 6, P.flowerYellow);
  r.rect(10, 17, 12, 4, P.leafA);
  r.rect(15, 15, 6, 6, '#81b29a');
};

// ── Furniture ───────────────────────────────────────────────────────────────

function shadowUnder(r: Raster, x: number, y: number, w: number, h: number): void {
  r.ellipse(x, y, w, h, P.shadow);
}

/** A desk of 2 tiles. `chairSide` = where the person sits (the monitor faces them). */
function desk(chairSide: 'south' | 'north'): Painter {
  return (r) => {
    r.rect(3, 26, 58, 5, P.softShadow);
    r.rect(4, 22, 3, 8, P.deskLeg);
    r.rect(57, 22, 3, 8, P.deskLeg);
    r.roundRect(1, 3, 62, 22, P.deskTop, 1);
    r.hline(2, 3, 60, P.deskTopLight);
    r.rect(1, 21, 62, 4, P.deskEdge);
    if (chairSide === 'south') {
      // Monitor at the back (north edge), screen facing the viewer.
      r.rect(20, 3, 24, 11, P.monitor);
      r.rect(22, 5, 20, 7, P.screen);
      r.hline(23, 6, 8, P.screenLight);
      r.rect(30, 14, 4, 2, P.monitor);
      r.rect(22, 16, 20, 4, P.keyboard);
      r.hline(23, 17, 18, '#d5d9de');
    } else {
      // Monitor at the front (south edge): we see its back.
      r.rect(20, 12, 24, 9, P.monitor);
      r.hline(21, 13, 22, '#3f4458');
      r.rect(30, 10, 4, 2, P.monitor);
      r.rect(22, 5, 20, 4, P.keyboard);
    }
  };
}

function chair(back: 'north' | 'south'): Painter {
  return (r) => {
    shadowUnder(r, 7, 20, 18, 9);
    r.roundRect(8, 9, 16, 14, P.chair, 3);
    r.roundRect(10, 11, 12, 10, P.chairLight, 2);
    if (back === 'north') r.roundRect(7, 4, 18, 6, P.chair, 2);
    else r.roundRect(7, 22, 18, 6, P.chair, 2);
  };
}

function pot(r: Raster, x: number, y: number, w: number, h: number): void {
  shadowUnder(r, x - 1, y + h - 4, w + 2, 6);
  r.rect(x, y, w, h, P.potA);
  r.rect(x, y, w, 2, P.potB);
  r.rect(x + w - 3, y + 2, 2, h - 2, P.potB);
}

function leaves(r: Raster, cx: number, cy: number, radius: number): void {
  r.ellipse(cx - radius, cy - radius, radius * 2, radius * 2, P.leafB);
  r.ellipse(cx - radius + 2, cy - radius + 1, radius * 2 - 5, radius * 2 - 5, P.leafA);
  r.ellipse(cx - 3, cy - radius + 3, 5, 4, P.leafC);
}

const plant: Painter = (r) => {
  pot(r, 10, 20, 12, 10);
  leaves(r, 16, 13, 9);
};

/** Tall plant: pot and stems below, foliage in the tile above (drawn over the avatars). */
const tallPlant: Painter = (r) => {
  // 32×64 picture: row 0 = foliage (above layer), row 1 = pot (below layer).
  pot(r, 10, 52, 12, 10);
  r.vline(15, 30, 22, P.leafB);
  r.vline(17, 34, 18, P.leafB);
  leaves(r, 16, 28, 12);
  leaves(r, 10, 38, 6);
  leaves(r, 22, 40, 6);
};

function bookshelf(): Painter {
  return (r) => {
    r.rect(1, 0, 62, 30, P.shelfWood);
    r.rect(1, 29, 62, 2, P.shelfDark);
    for (let shelf = 0; shelf < 3; shelf++) {
      const y = 2 + shelf * 9;
      r.rect(3, y, 58, 7, P.shelfDark);
      let x = 4;
      let i = shelf * 5;
      while (x < 58) {
        const w = 2 + Math.floor(hash2(i, shelf, 21) * 3);
        const h = 5 + Math.floor(hash2(i, shelf, 23) * 2);
        r.rect(x, y + 7 - h, w, h, P.books[i % P.books.length] ?? P.sofa);
        x += w + (hash2(i, shelf, 29) > 0.8 ? 3 : 1);
        i++;
      }
    }
  };
}

function sofa(): Painter {
  // 96×32, backrest at the top, facing south.
  return (r) => {
    r.rect(3, 26, 90, 5, P.softShadow);
    r.roundRect(2, 2, 92, 26, P.sofaDark, 3);
    r.roundRect(4, 4, 88, 9, P.sofa, 2);
    r.roundRect(2, 8, 8, 20, P.sofa, 2);
    r.roundRect(86, 8, 8, 20, P.sofa, 2);
    for (let i = 0; i < 3; i++) {
      r.roundRect(11 + i * 25, 13, 24, 13, P.sofaLight, 2);
      r.hline(12 + i * 25, 14, 22, mix(P.sofaLight, '#ffffff', 0.3));
    }
  };
}

function coffeeTable(): Painter {
  return (r) => {
    r.rect(6, 22, 52, 5, P.softShadow);
    r.roundRect(4, 8, 56, 16, P.shelfWood, 2);
    r.roundRect(6, 9, 52, 12, P.deskTopLight, 1);
    r.ellipse(16, 11, 7, 7, P.white);
    r.ellipse(18, 13, 3, 3, P.shelfDark);
    r.rect(36, 12, 12, 7, P.books[4]);
  };
}

/** Meeting table picture of 3×2 tiles; the middle column can be repeated. */
function meetingTable(): Painter {
  return (r) => {
    r.rect(5, 56, 86, 5, P.softShadow);
    r.roundRect(4, 6, 88, 50, P.tableEdge, 4);
    r.roundRect(6, 7, 84, 45, P.tableTop, 3);
    r.hline(8, 8, 80, P.white);
    r.rect(6, 50, 84, 2, P.tableShade);
    // Middle column pattern must tile: keep details inside the side columns.
    r.rect(12, 20, 12, 8, P.monitor);
    r.rect(13, 21, 10, 6, P.screen);
    r.rect(72, 30, 12, 8, P.monitor);
    r.rect(73, 31, 10, 6, P.screen);
    r.ellipse(68, 12, 12, 12, mix(P.tableTop, P.tableEdge, 0.25));
    r.ellipse(70, 14, 8, 8, P.leafA);
    r.ellipse(72, 15, 3, 3, P.leafC);
    r.ellipse(14, 34, 8, 8, P.white);
    r.ellipse(16, 36, 4, 4, P.shelfDark);
  };
}

function counter(kind: 'plain' | 'sink' | 'coffee'): Painter {
  return (r) => {
    r.rect(0, 4, 32, 20, P.counterTop);
    r.hline(0, 4, 32, P.white);
    r.rect(0, 24, 32, 8, P.counterFace);
    r.hline(0, 24, 32, P.metalDark);
    r.vline(15, 25, 7, P.metalDark);
    r.rect(12, 27, 2, 2, P.metal);
    r.rect(18, 27, 2, 2, P.metal);
    if (kind === 'sink') {
      r.roundRect(7, 8, 18, 12, P.metal, 2);
      r.roundRect(9, 10, 14, 8, P.metalDark, 1);
      r.rect(15, 5, 2, 5, P.metalDark);
    } else if (kind === 'coffee') {
      r.rect(8, 2, 16, 18, P.monitor);
      r.rect(10, 4, 12, 4, '#4a4e69');
      r.px(20, 5, '#e63946');
      r.rect(12, 12, 8, 6, '#1b1d2e');
      r.rect(14, 15, 4, 3, P.white);
    }
  };
}

const fridge: Painter = (r) => {
  shadowUnder(r, 4, 26, 24, 6);
  r.roundRect(5, 0, 22, 29, P.white, 2);
  r.hline(5, 11, 22, P.metal);
  r.rect(22, 4, 2, 5, P.metal);
  r.rect(22, 14, 2, 8, P.metal);
};

const bistroTable: Painter = (r) => {
  shadowUnder(r, 6, 22, 20, 8);
  r.rect(15, 16, 2, 10, P.metalDark);
  r.ellipse(5, 5, 22, 16, P.tableEdge);
  r.ellipse(6, 5, 20, 14, P.tableTop);
  r.ellipse(13, 8, 6, 5, P.white);
};

const stool: Painter = (r) => {
  shadowUnder(r, 9, 20, 14, 7);
  r.ellipse(9, 10, 14, 12, P.sofaDark);
  r.ellipse(10, 10, 12, 10, P.sofa);
};

const waterCooler: Painter = (r) => {
  shadowUnder(r, 7, 25, 18, 6);
  r.roundRect(9, 13, 14, 16, P.white, 1);
  r.rect(12, 18, 3, 2, '#3d9adb');
  r.rect(17, 18, 3, 2, '#e63946');
  r.roundRect(10, 1, 12, 13, '#8fd0f0', 3);
  r.rect(12, 3, 3, 8, P.waterLight);
};

const printer: Painter = (r) => {
  shadowUnder(r, 3, 24, 26, 7);
  r.roundRect(3, 10, 26, 17, P.counterFace, 2);
  r.rect(3, 10, 26, 6, P.counterTop);
  r.rect(8, 6, 16, 5, P.white);
  r.rect(22, 18, 4, 2, '#6fcf97');
};

/** Floor lamp, 32×64: shade in the upper tile (above layer), base and pole below. */
const floorLamp: Painter = (r) => {
  shadowUnder(r, 9, 57, 14, 6);
  r.ellipse(10, 56, 12, 6, P.metalDark);
  r.vline(15, 30, 28, P.metalDark);
  r.vline(16, 30, 28, P.metal);
  r.ellipse(1, 12, 30, 22, P.lampLight + '40');
  r.roundRect(8, 16, 16, 14, P.lampShade, 2);
  r.hline(9, 17, 14, P.lampLight);
};

const hedge: Painter = (r) => {
  r.rect(0, 26, 32, 6, P.softShadow);
  r.rect(0, 6, 32, 22, P.hedgeB);
  for (let i = 0; i < 4; i++) r.ellipse(i * 8 - 2, 1, 12, 12, P.hedgeB);
  for (let i = 0; i < 4; i++) r.ellipse(i * 8 - 1, 3, 10, 10, P.hedgeA);
  r.rect(0, 8, 32, 14, P.hedgeA);
  for (let i = 0; i < 6; i++) {
    r.px(Math.floor(hash2(i, 3, 31) * 30) + 1, Math.floor(hash2(i, 4, 37) * 18) + 4, P.hedgeC);
  }
};

const trunk: Painter = (r) => {
  shadowUnder(r, 2, 20, 28, 12);
  r.rect(12, 0, 8, 28, P.trunk);
  r.vline(13, 0, 28, P.trunkDark);
  r.rect(10, 24, 12, 4, P.trunk);
};

/** Tree canopy, 3×3 tiles, drawn in the above layer around and over the trunk. */
const canopy: Painter = (r) => {
  r.ellipse(4, 8, 88, 80, P.canopyB);
  r.ellipse(8, 6, 80, 72, P.canopyA);
  r.ellipse(18, 10, 40, 34, P.canopyC);
  for (let i = 0; i < 9; i++) {
    const x = 16 + Math.floor(hash2(i, 9, 41) * 60);
    const y = 16 + Math.floor(hash2(i, 9, 43) * 52);
    r.ellipse(x, y, 8, 6, i % 2 === 0 ? P.canopyB : P.canopyC);
  }
};

function bench(): Painter {
  return (r) => {
    r.rect(3, 24, 58, 5, P.softShadow);
    r.rect(6, 18, 3, 9, P.metalDark);
    r.rect(55, 18, 3, 9, P.metalDark);
    r.rect(2, 4, 60, 5, P.deskEdge);
    r.rect(2, 11, 60, 4, P.deskTop);
    r.rect(2, 17, 60, 4, P.deskTop);
    r.hline(2, 11, 60, P.deskTopLight);
    r.hline(2, 17, 60, P.deskTopLight);
  };
}

/** Fountain, 3×3 tiles. */
const fountain: Painter = (r) => {
  r.ellipse(4, 10, 88, 84, P.shadow);
  r.ellipse(4, 4, 88, 84, P.stoneDark);
  r.ellipse(8, 7, 80, 76, P.stone);
  r.ellipse(14, 13, 68, 64, P.water);
  for (let i = 0; i < 6; i++) {
    const x = 26 + Math.floor(hash2(i, 1, 47) * 40);
    const y = 24 + Math.floor(hash2(i, 1, 53) * 40);
    r.hline(x, y, 6, P.waterLight);
  }
  r.ellipse(36, 34, 24, 22, P.stoneDark);
  r.ellipse(38, 35, 20, 18, P.stone);
  r.ellipse(42, 38, 12, 10, P.water);
  r.ellipse(45, 30, 6, 12, P.waterLight);
};

const flowers: Painter = (r) => {
  const colors = [P.flowerPink, P.flowerYellow, P.flowerWhite, '#b69cf0'];
  for (let i = 0; i < 9; i++) {
    const x = 4 + Math.floor(hash2(i, 2, 59) * 24);
    const y = 6 + Math.floor(hash2(i, 2, 61) * 22);
    r.vline(x, y, 3, P.grassBlade);
    const color = colors[i % colors.length] ?? P.flowerWhite;
    r.px(x - 1, y - 1, color);
    r.px(x + 1, y - 1, color);
    r.px(x, y - 2, color);
    r.px(x, y - 1, P.flowerYellow);
  }
};

const rock: Painter = (r) => {
  shadowUnder(r, 5, 20, 24, 9);
  r.ellipse(6, 10, 22, 16, P.stoneDark);
  r.ellipse(7, 10, 18, 12, P.stone);
  r.hline(12, 12, 6, mix(P.stone, '#ffffff', 0.4));
};

/** Rug of 3×3 tiles; the middle row and column can be repeated. */
function rug(tones: readonly string[]): Painter {
  const [base = '#999999', dark = '#888888', light = '#aaaaaa'] = tones;
  return (r) => {
    // Rugs live in the floor layer, so they carry their own wooden floor underneath.
    const floor = new Raster(TILE, TILE);
    wood(0)(floor);
    for (let i = 0; i < 9; i++) r.draw(floor, (i % 3) * TILE, Math.floor(i / 3) * TILE);
    r.roundRect(2, 2, 92, 92, dark, 3);
    r.roundRect(5, 5, 86, 86, base, 2);
    r.rect(9, 9, 78, 1, light);
    r.rect(9, 86, 78, 1, light);
    r.rect(9, 9, 1, 78, light);
    r.rect(86, 9, 1, 78, light);
    // Center tile (32..63) gets a repeatable diamond pattern.
    for (let y = 32; y < 64; y += 8) {
      for (let x = 32; x < 64; x += 8) {
        r.px(x + 4, y + 2, light);
        r.px(x + 3, y + 3, light);
        r.px(x + 5, y + 3, light);
        r.px(x + 4, y + 4, light);
      }
    }
  };
}

const collision: Painter = (r) => {
  r.rect(0, 0, TILE, TILE, P.collision);
  r.hline(0, 0, TILE, '#e63946');
  r.vline(0, 0, TILE, '#e63946');
};

// ── Registry ────────────────────────────────────────────────────────────────

class TilesetBuilder {
  readonly names: string[] = [];
  readonly tiles: Raster[] = [];

  tile(name: string, paint: Painter): this {
    const r = new Raster(TILE, TILE);
    paint(r);
    this.names.push(name);
    this.tiles.push(r);
    return this;
  }

  /** Paints a `cols × rows` picture and registers `<name>-<col>-<row>` tiles. */
  composite(name: string, cols: number, rows: number, paint: Painter): this {
    const picture = new Raster(cols * TILE, rows * TILE);
    paint(picture);
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        this.names.push(`${name}-${String(col)}-${String(row)}`);
        this.tiles.push(picture.crop(col * TILE, row * TILE, TILE, TILE));
      }
    }
    return this;
  }
}

function build(): TilesetBuilder {
  const b = new TilesetBuilder();
  b.tile('collision', collision);
  for (let v = 0; v < 3; v++) b.tile(`wood-${String(v)}`, wood(v));
  b.tile('kitchen', kitchenTiles());
  for (const [name, tones] of Object.entries(P.carpet)) b.tile(`carpet-${name}`, carpet(tones));
  for (let v = 0; v < 3; v++) b.tile(`grass-${String(v)}`, grass(v));
  for (let v = 0; v < 2; v++) b.tile(`path-${String(v)}`, path(v));
  b.tile('door-mat', doorMat());
  b.tile('wall-cap', wallCap());
  b.tile('wall-face', wallFace());
  b.tile('wall-window', wallFace(windowDecor));
  b.tile('wall-art', wallFace(artDecor));
  b.composite('whiteboard', 2, 1, (r) => {
    const face = new Raster(TILE, TILE);
    wallFace()(face);
    r.draw(face, 0, 0);
    r.draw(face, TILE, 0);
    r.rect(4, 9, 56, 16, P.metal);
    r.rect(5, 10, 54, 14, P.white);
    r.hline(9, 13, 18, '#3d9adb');
    r.hline(9, 16, 12, '#e63946');
    r.hline(32, 14, 20, P.leafA);
    r.hline(32, 18, 14, '#3d9adb');
    r.rect(24, 25, 16, 2, P.metalDark);
  });
  b.composite('desk-s', 2, 1, desk('south'));
  b.composite('desk-n', 2, 1, desk('north'));
  b.tile('chair-s', chair('south'));
  b.tile('chair-n', chair('north'));
  for (const side of ['south', 'north'] as const) {
    b.composite(`seat-${side === 'south' ? 's' : 'n'}`, 2, 1, (r) => {
      const single = new Raster(TILE, TILE);
      chair(side)(single);
      r.draw(single, TILE / 2, 0);
    });
  }
  b.tile('plant', plant);
  b.composite('plant-tall', 1, 2, tallPlant);
  b.composite('bookshelf', 2, 1, bookshelf());
  b.composite('sofa', 3, 1, sofa());
  b.composite('coffee-table', 2, 1, coffeeTable());
  b.composite('table', 3, 2, meetingTable());
  b.tile('counter', counter('plain'));
  b.tile('counter-sink', counter('sink'));
  b.tile('counter-coffee', counter('coffee'));
  b.tile('fridge', fridge);
  b.tile('bistro-table', bistroTable);
  b.tile('stool', stool);
  b.tile('water-cooler', waterCooler);
  b.tile('printer', printer);
  b.composite('lamp', 1, 2, floorLamp);
  b.tile('hedge', hedge);
  b.tile('trunk', trunk);
  b.composite('canopy', 3, 3, canopy);
  b.composite('bench', 2, 1, bench());
  b.composite('fountain', 3, 3, fountain);
  b.tile('flowers', flowers);
  b.tile('rock', rock);
  b.composite('rug', 3, 3, rug(P.carpet.amber));
  return b;
}

let cached: Tileset | undefined;

/** The tileset (built once per process; painting is deterministic). */
export function pixelTileset(): Tileset {
  if (cached !== undefined) return cached;
  const b = build();
  const index = new Map(b.names.map((name, i) => [name, i + 1]));
  const tiles = b.tiles;
  cached = {
    names: b.names,
    tiles,
    gid(name) {
      const gid = index.get(name);
      if (gid === undefined) throw new Error(`unknown tile "${name}"`);
      return gid;
    },
    tile(gid) {
      const tile = tiles[gid - 1];
      if (tile === undefined) throw new Error(`unknown gid ${String(gid)}`);
      return tile;
    },
    image() {
      const rows = Math.ceil(tiles.length / TILESET_COLUMNS);
      const image = new Raster(TILESET_COLUMNS * TILE, rows * TILE);
      tiles.forEach((tile, i) => {
        image.draw(tile, (i % TILESET_COLUMNS) * TILE, Math.floor(i / TILESET_COLUMNS) * TILE);
      });
      return image;
    },
  };
  return cached;
}
