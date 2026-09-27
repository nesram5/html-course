import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { isWalkable, parseMap, roomAt, type Tile, type WorldMap } from '@bululu/shared';
import { beforeAll, describe, expect, it } from 'vitest';

import { parseManifest } from '../../src/manifest.js';
import { generateAll, type GeneratedFile } from '../generator/index.js';
import { readPngSize } from '../lib/png.js';

const root = join(import.meta.dirname, '..', '..');

let files: GeneratedFile[];

beforeAll(() => {
  files = generateAll();
}, 60_000);

function mapOf(dir: string): WorldMap {
  return parseMap(JSON.parse(readFileSync(join(root, 'templates', dir, 'map.tmj'), 'utf8')));
}

/** Tiles reachable on foot from `start` (4-neighbourhood). */
function reachable(map: WorldMap, start: Tile): Set<string> {
  const seen = new Set([`${String(start.x)},${String(start.y)}`]);
  const queue = [start];
  for (let tile = queue.shift(); tile !== undefined; tile = queue.shift()) {
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const) {
      const next = { x: tile.x + dx, y: tile.y + dy };
      const key = `${String(next.x)},${String(next.y)}`;
      if (!seen.has(key) && isWalkable(map, next.x, next.y)) {
        seen.add(key);
        queue.push(next);
      }
    }
  }
  return seen;
}

describe('generator', () => {
  it('reproduces the committed assets byte for byte', () => {
    const different = files
      .filter((file) => !readFileSync(join(root, file.path)).equals(file.bytes))
      .map((file) => file.path);

    expect(different, 'run `pnpm --filter @bululu/maps generate` and commit it').toEqual([]);
  });

  it('lists 2 templates with 3 themes, 8 avatars and at least 12 decor items in the manifest', () => {
    const manifest = parseManifest(JSON.parse(readFileSync(join(root, 'manifest.json'), 'utf8')));

    expect(manifest.templates.map((t) => [t.id, t.name, t.themes.map((th) => th.id)])).toEqual([
      ['office-small@1', 'Oficina pequeña', ['pixel', 'night', 'watercolor']],
      ['campus@1', 'Campus', ['pixel', 'night', 'watercolor']],
    ]);
    expect(manifest.avatars).toHaveLength(8);
    expect(manifest.avatars[0]?.id).toBe('avatar-01');
    expect(manifest.decor.length).toBeGreaterThanOrEqual(12);
    for (const id of [
      'plant',
      'lamp',
      'mug',
      'frame',
      'trophy',
      'cat',
      'books',
      'globe',
      'cactus',
      'radio',
      'clock',
      'flag',
    ]) {
      expect(manifest.decor.map((d) => d.id)).toContain(id);
    }
  });

  it.each([
    ['office-small', 40, 30, 1, 10],
    ['campus', 80, 60, 3, 20],
  ])(
    '%s: %ix%i tiles, %i meeting rooms, at least %i desks and 2 spawns',
    (dir, width, height, rooms, desks) => {
      const map = mapOf(dir);

      expect([map.width, map.height]).toEqual([width, height]);
      expect(map.rooms).toHaveLength(rooms);
      expect(map.desks.length).toBeGreaterThanOrEqual(desks);
      expect(map.spawns.length).toBeGreaterThanOrEqual(2);
      // Every style with its own images ("skins", ADR-011) covers exactly the same map.
      for (const theme of ['pixel', 'watercolor']) {
        for (const image of ['below', 'above']) {
          const png = readFileSync(join(root, 'templates', dir, 'themes', theme, `${image}.png`));
          expect(readPngSize(png), `${theme}/${image}`).toEqual({
            width: width * 32,
            height: height * 32,
          });
        }
      }
    },
  );

  it.each(['office-small', 'campus'])(
    '%s: closed borders, every room and desk reachable from every spawn',
    (dir) => {
      const map = mapOf(dir);
      for (let x = 0; x < map.width; x++) {
        expect(isWalkable(map, x, 0) || isWalkable(map, x, map.height - 1)).toBe(false);
      }
      for (let y = 0; y < map.height; y++) {
        expect(isWalkable(map, 0, y) || isWalkable(map, map.width - 1, y)).toBe(false);
      }

      for (const spawn of map.spawns) {
        const area = reachable(map, spawn);
        const roomsReached = new Set(
          [...area].map((key) => {
            const [x = 0, y = 0] = key.split(',').map(Number);
            return roomAt(map, x, y);
          }),
        );
        for (const room of map.rooms) expect(roomsReached, room.areaId).toContain(room.areaId);
        for (const desk of map.desks) {
          const chairs = [desk.y - 1, desk.y + 1].flatMap((y) => [
            `${String(desk.x)},${String(y)}`,
            `${String(desk.x + 1)},${String(y)}`,
          ]);
          expect(
            chairs.some((key) => area.has(key)),
            desk.deskId,
          ).toBe(true);
        }
      }
    },
  );

  it('draws avatar sheets of 3×4 frames and 16×16 decor items', () => {
    for (const file of files.filter((f) => f.path.startsWith('avatars/'))) {
      expect(readPngSize(file.bytes), file.path).toEqual({ width: 96, height: 128 });
    }
    for (const file of files.filter((f) => f.path.startsWith('decor/'))) {
      expect(readPngSize(file.bytes), file.path).toEqual({ width: 16, height: 16 });
    }
  });
});
