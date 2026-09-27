/**
 * The two map templates (E2-S1): "Oficina pequeña" (40×30, 1 meeting room) and "Campus"
 * (80×60, 3 meeting rooms). Coordinates are in tiles; see `map-builder.ts`.
 */
import { MapBuilder, type BuiltMap } from './map-builder.js';
import { createRandom, hash2 } from './raster.js';
import type { Tileset } from './tileset.js';

export interface TemplateSpec {
  readonly dir: string;
  readonly version: number;
  readonly name: string;
  /** Downscale factor of the thumbnail (map pixels / factor). */
  readonly thumbnailScale: number;
  build(tileset: Tileset): BuiltMap;
}

function woodFloor(x: number, y: number): string {
  return `wood-${String(Math.floor(hash2(x, y, 1) * 3))}`;
}

function grassFloor(x: number, y: number): string {
  const h = hash2(x, y, 2);
  if (h < 0.04) return 'grass-2';
  return h < 0.4 ? 'grass-1' : 'grass-0';
}

function deskIds(): () => string {
  let n = 0;
  return () => {
    n++;
    return `desk-${String(n).padStart(2, '0')}`;
  };
}

/** Kitchen strip: counters against the wall face on row `y`, bistro tables below. */
function kitchen(b: MapBuilder, x: number, y: number, w: number, h: number): void {
  b.setFloor(x, y, w, h, 'kitchen');
  b.put(x, y, 'water-cooler', { solid: true });
  for (let i = 1; i < w - 1; i++) {
    const tile = i === 3 ? 'counter-sink' : i === 6 ? 'counter-coffee' : 'counter';
    b.put(x + i, y, tile, { solid: true });
  }
  b.put(x + w - 1, y, 'fridge', { solid: true });
  for (const tx of [x + 3, x + 7]) {
    b.put(tx, y + 3, 'bistro-table', { solid: true });
    b.put(tx - 1, y + 3, 'stool').put(tx + 1, y + 3, 'stool');
  }
}

/** Sofa facing a coffee table on a rug. Footprint 5×5 starting at (x, y) = sofa row. */
function lounge(b: MapBuilder, x: number, y: number): void {
  b.rug(x, y + 1, 5, 4);
  b.object(x + 1, y, 'sofa', 3, 1);
  b.object(x + 1, y + 2, 'coffee-table', 2, 1);
}

/** Meeting room furniture: table centered, chairs on both sides, whiteboard and plants. */
function meetingRoom(
  b: MapBuilder,
  x: number,
  y: number,
  w: number,
  h: number,
  tableWidth: number,
): void {
  const tableX = x + Math.floor((w - tableWidth) / 2);
  const tableY = y + Math.floor(h / 2) - 1;
  b.table(tableX, tableY, tableWidth);
  for (let i = 1; i < tableWidth - 1; i++) {
    b.put(tableX + i, tableY - 1, 'chair-n').put(tableX + i, tableY + 2, 'chair-s');
  }
  const boardX = x + Math.floor(w / 2) - 1;
  b.decorateWall(boardX, y - 1, 'whiteboard-0-0').decorateWall(boardX + 1, y - 1, 'whiteboard-1-0');
  b.decorateWall(x + 1, y - 1, 'wall-window').decorateWall(x + w - 2, y - 1, 'wall-window');
  b.tall(x, y + 1, 'plant-tall').tall(x + w - 1, y + 1, 'plant-tall');
  b.put(x, y + h - 1, 'plant', { solid: true }).put(x + w - 1, y + h - 1, 'plant', { solid: true });
}

export const officeSmall: TemplateSpec = {
  dir: 'office-small',
  version: 1,
  name: 'Oficina pequeña',
  thumbnailScale: 4,
  build(tileset) {
    const b = new MapBuilder(40, 30, woodFloor);
    b.wallRect(0, 0, 40, 30);

    // Meeting room (top right), door on its left wall.
    b.wallLine(27, 0, 1, 11).wallLine(27, 10, 13, 1).opening(27, 6, 1, 2);
    b.setFloor(28, 1, 11, 9, 'carpet-blue');
    b.room(28, 1, 11, 9, 'sala-reuniones', 'Sala de reuniones');
    meetingRoom(b, 28, 1, 11, 9, 7);

    // Top wall: bookshelves, windows and a picture.
    for (const x of [2, 5]) b.object(x, 1, 'bookshelf', 2, 1);
    for (const x of [13, 17, 21, 25]) b.decorateWall(x, 0, 'wall-window');
    b.decorateWall(10, 0, 'wall-art');
    b.put(24, 1, 'printer', { solid: true }).put(25, 1, 'water-cooler', { solid: true });
    b.tall(8, 2, 'plant-tall');

    // Open office: 4 pods of 4 desks.
    const nextDesk = deskIds();
    for (const x of [3, 9, 15, 21]) b.pod(x, 4, nextDesk);

    // Lounge and huddle tables (bottom left).
    lounge(b, 3, 11);
    b.tall(2, 12, 'plant-tall').tall(9, 12, 'lamp');
    for (const x of [15, 20]) {
      b.put(x, 13, 'bistro-table', { solid: true });
      b.put(x - 1, 13, 'stool').put(x + 1, 13, 'stool');
    }
    // Second desk area and a small library (bottom left).
    for (const x of [15, 21]) b.pod(x, 17, nextDesk);
    for (const x of [2, 4, 6]) b.object(x, 18, 'bookshelf', 2, 1);
    b.rug(2, 19, 7, 4);
    b.put(4, 20, 'bistro-table', { solid: true }).put(3, 20, 'stool').put(5, 20, 'stool');
    b.put(7, 21, 'bistro-table', { solid: true }).put(6, 21, 'stool').put(8, 21, 'stool');
    b.tall(1, 26, 'plant-tall').tall(26, 26, 'plant-tall').tall(10, 19, 'lamp');
    b.put(19, 23, 'plant', { solid: true });

    // Kitchen and second lounge (bottom right).
    kitchen(b, 28, 11, 11, 7);
    lounge(b, 30, 21);
    b.tall(29, 22, 'plant-tall').tall(36, 22, 'lamp');
    b.put(28, 28, 'plant', { solid: true }).put(38, 28, 'plant', { solid: true });

    // Entrance: door mat, plants and spawn points.
    b.setFloor(12, 28, 2, 1, 'door-mat');
    b.put(10, 28, 'plant', { solid: true }).put(15, 28, 'plant', { solid: true });
    b.put(1, 28, 'plant', { solid: true }).put(26, 28, 'plant', { solid: true });
    for (const x of [11, 12, 13, 14]) b.spawn(x, 25);

    return b.build(tileset);
  },
};

export const campus: TemplateSpec = {
  dir: 'campus',
  version: 1,
  name: 'Campus',
  thumbnailScale: 8,
  build(tileset) {
    const W = 80;
    const H = 60;
    const b = new MapBuilder(W, H, grassFloor);

    // ── Main building ──
    const bx = 6;
    const by = 5;
    const bw = 52;
    const bh = 30;
    b.setFloor(bx, by, bw, bh, woodFloor);
    b.wallRect(bx, by, bw, bh);
    // Meeting rooms along the top, kitchen at the top right.
    b.wallLine(bx, 14, bw, 1);
    for (const x of [19, 32, 45]) b.wallLine(x, by, 1, 10);
    const rooms = [
      { x: 7, areaId: 'sala-mar', name: 'Sala Mar', carpet: 'carpet-blue', door: 12 },
      { x: 20, areaId: 'sala-bosque', name: 'Sala Bosque', carpet: 'carpet-green', door: 25 },
      { x: 33, areaId: 'sala-coral', name: 'Sala Coral', carpet: 'carpet-rose', door: 38 },
    ];
    for (const room of rooms) {
      b.setFloor(room.x, 6, 12, 8, room.carpet);
      b.room(room.x, 6, 12, 8, room.areaId, room.name);
      meetingRoom(b, room.x, 6, 12, 8, 8);
      b.opening(room.door, 14, 2, 1);
    }
    kitchen(b, 46, 6, 11, 8);
    b.opening(50, 14, 2, 1);

    // Entrances (south, west, east) with windows on the façade.
    b.opening(31, by + bh - 1, 2, 1)
      .opening(bx, 24, 1, 2)
      .opening(bx + bw - 1, 24, 1, 2);
    b.setFloor(31, by + bh - 2, 2, 1, 'door-mat');
    for (let x = bx + 3; x < bx + bw - 2; x += 4) {
      if (x < 29 || x > 34) b.decorateWall(x, by + bh - 1, 'wall-window');
    }

    // Open office: 8 pods of 4 desks.
    const nextDesk = deskIds();
    for (const y of [17, 24]) for (const x of [9, 15, 21, 27]) b.pod(x, y, nextDesk);

    // Right wing: library, lounges, printer corner.
    for (const x of [41, 43, 52, 54]) b.object(x, 15, 'bookshelf', 2, 1);
    lounge(b, 38, 19);
    lounge(b, 47, 25);
    b.tall(37, 20, 'plant-tall')
      .tall(44, 20, 'lamp')
      .tall(46, 26, 'plant-tall')
      .tall(53, 26, 'lamp');
    b.put(55, 18, 'printer', { solid: true }).put(56, 18, 'water-cooler', { solid: true });
    b.tall(7, 17, 'plant-tall').tall(56, 32, 'plant-tall').tall(7, 32, 'plant-tall');
    b.put(34, 32, 'plant', { solid: true }).put(29, 32, 'plant', { solid: true });

    // ── Outdoors ──
    const pathFill = (x: number, y: number) => `path-${String(Math.floor(hash2(x, y, 3) * 2))}`;
    b.setFloor(31, by + bh, 2, 6, pathFill); // entrance → square
    b.setFloor(26, 41, 12, 12, pathFill); // square
    b.setFloor(2, 46, 24, 2, pathFill).setFloor(38, 46, 40, 2, pathFill); // east-west avenue
    b.setFloor(2, 24, 4, 2, pathFill).setFloor(58, 24, 20, 2, pathFill); // side exits
    b.setFloor(2, 24, 2, 22, pathFill).setFloor(76, 24, 2, 22, pathFill);
    b.object(30, 45, 'fountain', 3, 3);
    for (const [x, y] of [
      [27, 42],
      [35, 42],
      [27, 51],
      [35, 51],
    ] as const) {
      b.object(x, y, 'bench', 2, 1);
    }
    for (const [x, y] of [
      [29, 44],
      [34, 44],
      [29, 49],
      [34, 49],
    ] as const) {
      b.spawn(x, y);
    }

    // Hedge around the campus.
    for (let x = 0; x < W; x++)
      b.put(x, 0, 'hedge', { solid: true }).put(x, H - 1, 'hedge', { solid: true });
    for (let y = 1; y < H - 1; y++)
      b.put(0, y, 'hedge', { solid: true }).put(W - 1, y, 'hedge', { solid: true });

    // Trees, flowers and rocks scattered on free grass (deterministic).
    const random = createRandom(20260926);
    const isPath = (x: number, y: number) =>
      (x >= 26 && x <= 37 && y >= 41 && y <= 52) ||
      (y >= 45 && y <= 48) ||
      (y >= 23 && y <= 26 && (x <= 6 || x >= 57)) ||
      ((x <= 4 || x >= 75) && y >= 23 && y <= 48) ||
      (x >= 30 && x <= 33 && y >= 34 && y <= 41);
    const nearBuilding = (x: number, y: number) =>
      x >= bx - 2 && x <= bx + bw + 1 && y >= by - 1 && y <= by + bh + 2;
    const trees: { x: number; y: number }[] = [];
    for (let attempt = 0; attempt < 4000 && trees.length < 60; attempt++) {
      const x = 2 + Math.floor(random() * (W - 4));
      const y = 3 + Math.floor(random() * (H - 5));
      let ok = true;
      for (let dy = -3; dy <= 1 && ok; dy++) {
        for (let dx = -2; dx <= 2 && ok; dx++) {
          if (isPath(x + dx, y + dy) || nearBuilding(x + dx, y + dy)) ok = false;
        }
      }
      if (!ok || !b.isFree(x, y)) continue;
      if (trees.some((t) => Math.abs(t.x - x) < 4 && Math.abs(t.y - y) < 4)) continue;
      trees.push({ x, y });
      b.tree(x, y);
    }
    for (let attempt = 0; attempt < 600; attempt++) {
      const x = 1 + Math.floor(random() * (W - 2));
      const y = 1 + Math.floor(random() * (H - 2));
      if (isPath(x, y) || nearBuilding(x, y) || !b.isFree(x, y)) continue;
      if (trees.some((t) => Math.abs(t.x - x) <= 1 && y >= t.y - 2 && y <= t.y)) continue;
      const roll = random();
      if (roll < 0.1) b.put(x, y, 'rock', { solid: true });
      else if (roll < 0.35) b.put(x, y, 'flowers');
    }

    return b.build(tileset);
  },
};

export const TEMPLATES: readonly TemplateSpec[] = [officeSmall, campus];
