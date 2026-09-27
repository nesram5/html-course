import { execFileSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { Raster } from '../generator/raster.js';
import { encodePng } from '../lib/png.js';
import { validateMapsPackage } from '../lib/validate.js';

const root = join(import.meta.dirname, '..', '..');
const copies: string[] = [];

interface TmjLayer {
  name: string;
  type: string;
  objects?: Record<string, unknown>[];
  [key: string]: unknown;
}

/** A throwaway copy of the package assets that a test can break. */
function copyPackage(): string {
  const dir = mkdtempSync(join(tmpdir(), 'plaza-maps-'));
  copies.push(dir);
  for (const entry of ['manifest.json', 'LICENSES.md', 'templates', 'avatars', 'decor']) {
    cpSync(join(root, entry), join(dir, entry), { recursive: true });
  }
  return dir;
}

function editJson<T>(dir: string, path: string, edit: (json: T) => void): T {
  const file = join(dir, path);
  const json = JSON.parse(readFileSync(file, 'utf8')) as T;
  edit(json);
  writeFileSync(file, JSON.stringify(json));
  return json;
}

function editMap(dir: string, edit: (layers: TmjLayer[]) => TmjLayer[] | undefined): void {
  editJson<{ layers: TmjLayer[] }>(dir, 'templates/office-small/map.tmj', (tmj) => {
    tmj.layers = edit(tmj.layers) ?? tmj.layers;
  });
}

function objectsOf(layers: TmjLayer[], name: string): Record<string, unknown>[] {
  return layers.find((layer) => layer.name === name)?.objects ?? [];
}

afterEach(() => {
  for (const dir of copies.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('validate:maps', () => {
  it('accepts the committed package', () => {
    const report = validateMapsPackage(root);

    expect(report.problems).toEqual([]);
    expect(report.manifest?.templates).toHaveLength(2);
  });

  it('fails when a map has no collision layer', () => {
    const dir = copyPackage();
    editMap(dir, (layers) => layers.filter((layer) => layer.name !== 'collision'));

    expect(validateMapsPackage(dir).problems).toContain(
      'templates/office-small/map.tmj: missing layer "collision"',
    );
  });

  it('fails when a room is not a rectangle', () => {
    const dir = copyPackage();
    editMap(dir, (layers) => {
      Object.assign(objectsOf(layers, 'rooms')[0] ?? {}, {
        polygon: [
          { x: 0, y: 0 },
          { x: 64, y: 0 },
          { x: 0, y: 64 },
        ],
      });
      return undefined;
    });

    expect(validateMapsPackage(dir).problems).toContain(
      'templates/office-small/map.tmj: rooms: object 1 "Sala de reuniones" must be a rectangle, found a polygon',
    );
  });

  it('fails when a room has no areaId', () => {
    const dir = copyPackage();
    editMap(dir, (layers) => {
      const room = objectsOf(layers, 'rooms')[0] ?? {};
      room.properties = [{ name: 'name', type: 'string', value: 'Sala' }];
      return undefined;
    });

    expect(validateMapsPackage(dir).problems).toContain(
      'templates/office-small/map.tmj: rooms: object 1 "Sala de reuniones" needs the property "areaId"',
    );
  });

  it('fails without decor layers, with fewer than 2 spawns or with desks on walkable tiles', () => {
    const dir = copyPackage();
    editMap(dir, (layers) => {
      const spawns = layers.find((layer) => layer.name === 'spawns');
      if (spawns?.objects !== undefined) spawns.objects = spawns.objects.slice(0, 1);
      Object.assign(objectsOf(layers, 'desks')[0] ?? {}, { x: 32 * 12, y: 32 * 25 });
      return layers.filter((layer) => layer.name !== 'decor-above');
    });

    const { problems } = validateMapsPackage(dir);

    expect(problems).toContain('templates/office-small/map.tmj: missing tile layer "decor-above"');
    expect(problems).toContain(
      'templates/office-small/map.tmj: needs at least 2 spawn points, found 1',
    );
    expect(problems).toContain(
      'templates/office-small/map.tmj: desk "desk-01" must be over blocking furniture, walkable tiles (12,25) (13,25)',
    );
  });

  it('fails when theme images do not match the map size', () => {
    const dir = copyPackage();
    const wrong = new Raster(64, 32);
    writeFileSync(
      join(dir, 'templates/campus/themes/pixel/above.png'),
      encodePng(64, 32, wrong.data),
    );
    writeFileSync(join(dir, 'templates/campus/themes/pixel/below.png'), 'not a png');

    const { problems } = validateMapsPackage(dir);

    expect(problems).toContain(
      'templates/campus/themes/pixel/above.png: is 64x32 px, the map needs 2560x1920 px',
    );
    expect(problems).toContain('templates/campus/themes/pixel/below.png: not a PNG image');
  });

  it('fails on undeclared or unknown licenses and broken color variants', () => {
    const dir = copyPackage();
    editJson<Record<string, unknown>>(
      dir,
      'templates/office-small/themes/pixel/theme.json',
      (theme) => {
        delete theme.license;
      },
    );
    editJson<Record<string, unknown>>(dir, 'templates/campus/themes/pixel/theme.json', (theme) => {
      theme.license = 'All rights reserved';
    });
    editJson<Record<string, unknown>>(dir, 'templates/campus/themes/night/theme.json', (theme) => {
      theme.baseThemeId = 'watercolor';
      delete theme.colorMatrix;
    });

    const { problems } = validateMapsPackage(dir);

    expect(
      problems.find((p) => p.startsWith('templates/office-small/themes/pixel/theme.json: license')),
    ).toBeDefined();
    expect(problems).toContain(
      'templates/campus/themes/pixel/theme.json: license "All rights reserved" is not one of CC0-1.0, CC-BY-4.0, CC-BY-SA-4.0, OFL-1.1, MIT',
    );
    expect(problems).toContain(
      'templates/campus/themes/night/theme.json: baseThemeId "watercolor" is not a theme of this template',
    );
    expect(problems).toContain(
      'templates/campus/themes/night/theme.json: a color variant needs a colorMatrix',
    );
  });

  it('checks avatar and decor sprite sizes and missing files', () => {
    const dir = copyPackage();
    writeFileSync(join(dir, 'avatars/avatar-02.png'), encodePng(32, 32, new Raster(32, 32).data));
    writeFileSync(join(dir, 'decor/mug.png'), encodePng(20, 16, new Raster(20, 16).data));
    rmSync(join(dir, 'decor/cat.png'));
    rmSync(join(dir, 'LICENSES.md'));

    const { problems } = validateMapsPackage(dir);

    expect(problems).toContain(
      'avatars/avatar-02.png: is 32x32 px, expected 96x128 (3 frames × 4 directions)',
    );
    expect(problems).toContain('decor/mug.png: is 20x16 px, expected 16x16 or 32x32');
    expect(problems).toContain('missing file: decor/cat.png');
    expect(problems).toContain('missing file: LICENSES.md');
  });

  it('reports an invalid manifest', () => {
    const dir = copyPackage();
    writeFileSync(join(dir, 'manifest.json'), '{ "version": 2 }');

    expect(validateMapsPackage(dir).problems[0]).toMatch(/^manifest\.json: /);
  });

  it('exits with an error naming the problem when run from the command line', () => {
    const dir = copyPackage();
    editMap(dir, (layers) => layers.filter((layer) => layer.name !== 'collision'));

    const run = () =>
      execFileSync(
        'pnpm',
        ['exec', 'tsx', '--conditions=@plaza/source', 'scripts/validate-maps.ts', dir],
        {
          cwd: root,
          stdio: 'pipe',
        },
      );

    expect(run).toThrow(/missing layer "collision"/);
  }, 30_000);
});
