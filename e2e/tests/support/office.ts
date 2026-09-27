import { expect, type APIRequestContext, type Page } from '@playwright/test';

import { step, tile } from './world';

/** Office personalization as reported by `window.__plazaWorld.office()` (E9). */
export interface OfficeProbe {
  themeId: string;
  swaps: number;
  styleTextures: string[];
  /** Styles loaded ahead when the office starts, ready to be shown without loading. */
  preloaded: string[];
  desks: { deskId: string; label: string; items: string[] }[];
  /** Last desk the camera was asked to show ("Ir a su escritorio", E9-S2). */
  shownDesk: string | null;
}

export function office(page: Page): Promise<OfficeProbe | null> {
  return page.evaluate(() => window.__plazaWorld?.office() ?? null);
}

export interface Tile {
  x: number;
  y: number;
}

export interface DeskRect extends Tile {
  deskId: string;
  width: number;
  height: number;
}

/** What the tests need from a `map.tmj`: walkable tiles and desk rectangles. */
export interface TestMap {
  width: number;
  height: number;
  blocked: (x: number, y: number) => boolean;
  desks: DeskRect[];
}

interface TmjLayer {
  name: string;
  data?: number[];
  objects?: {
    x: number;
    y: number;
    width: number;
    height: number;
    properties?: { name: string; value: unknown }[];
  }[];
}

export async function loadMap(request: APIRequestContext, dir: string): Promise<TestMap> {
  const response = await request.get(`/assets/maps/templates/${dir}/map.tmj`);
  expect(response.status()).toBe(200);
  const tmj = (await response.json()) as { width: number; height: number; layers: TmjLayer[] };
  const collision = tmj.layers.find((layer) => layer.name === 'collision')?.data ?? [];
  const desks = (tmj.layers.find((layer) => layer.name === 'desks')?.objects ?? []).map((o) => ({
    deskId: String(o.properties?.find((p) => p.name === 'deskId')?.value),
    x: o.x / 32,
    y: o.y / 32,
    width: o.width / 32,
    height: o.height / 32,
  }));
  return {
    width: tmj.width,
    height: tmj.height,
    blocked: (x, y) =>
      x < 0 || y < 0 || x >= tmj.width || y >= tmj.height || collision[y * tmj.width + x] !== 0,
    desks,
  };
}

/** Tiles in front of (below) a desk, where a person stands to use it. */
export function frontOf(desk: DeskRect): Tile[] {
  return Array.from({ length: desk.width }, (_, i) => ({ x: desk.x + i, y: desk.y + desk.height }));
}

/** Shortest walk (4-neighbourhood) from `from` to any tile of `goals`, excluding `from`. */
export function pathTo(map: TestMap, from: Tile, goals: Tile[]): Tile[] | null {
  const key = (t: Tile) => `${String(t.x)},${String(t.y)}`;
  const goalKeys = new Set(goals.filter((g) => !map.blocked(g.x, g.y)).map(key));
  const previous = new Map<string, Tile | null>([[key(from), null]]);
  const queue: Tile[] = [from];
  for (let current = queue.shift(); current !== undefined; current = queue.shift()) {
    if (goalKeys.has(key(current))) {
      const path: Tile[] = [];
      for (let at: Tile | null = current; at !== null; at = previous.get(key(at)) ?? null) {
        path.unshift(at);
      }
      return path.slice(1);
    }
    for (const [dx, dy] of [
      [0, -1],
      [0, 1],
      [-1, 0],
      [1, 0],
    ] as const) {
      const next = { x: current.x + dx, y: current.y + dy };
      if (map.blocked(next.x, next.y) || previous.has(key(next))) continue;
      previous.set(key(next), current);
      queue.push(next);
    }
  }
  return null;
}

/** Walks the local avatar along `path` with the arrow keys, one confirmed tile at a time. */
export async function walk(page: Page, path: Tile[]): Promise<void> {
  await page.getByTestId('world-canvas').focus();
  for (const next of path) {
    const at = await tile(page);
    const key =
      next.x > at.x
        ? 'ArrowRight'
        : next.x < at.x
          ? 'ArrowLeft'
          : next.y > at.y
            ? 'ArrowDown'
            : 'ArrowUp';
    await step(page, key, { expected: next });
  }
}
