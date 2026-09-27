/**
 * Checks of `pnpm validate:maps` (E2-S1, E9-S1, E9-S2), as a function so tests can run them on
 * broken copies of the package. Returns every problem found; an empty list means valid.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  DECOR_TILE_LAYERS,
  MAX_THEME_IMAGE_PX,
  MapParseError,
  TILE_SIZE,
  isWalkable,
  parseMap,
  tilesOf,
  type WorldMap,
} from '@bululu/shared';

import {
  MapsManifestSchema,
  ThemeFileSchema,
  type MapsManifest,
  type ManifestTemplate,
  type ThemeFile,
} from '../../src/manifest.js';
import { readPngSize, type PngInfo } from './png.js';

/** Licenses accepted for art (SPDX ids). Anything else needs a conscious review. */
export const ALLOWED_LICENSES = ['CC0-1.0', 'CC-BY-4.0', 'CC-BY-SA-4.0', 'OFL-1.1', 'MIT'] as const;
/** Office styles each template offers at least (E9-S1: "mínimo 2"). */
export const MIN_THEMES = 2;
/** Minimum spawn points per template (E2-S1). */
export const MIN_SPAWNS = 2;
/** Avatar sheets: 3 walking frames × 4 directions (E1-S4). */
export const AVATAR_COLUMNS = 3;
export const AVATAR_ROWS = 4;
/** Desk decoration sprites are small squares (E9-S3). */
export const DECOR_SIZES = [16, 32] as const;

export interface ValidationReport {
  readonly problems: string[];
  readonly manifest: MapsManifest | null;
}

class Checker {
  readonly problems: string[] = [];

  constructor(private readonly root: string) {}

  problem(message: string): void {
    this.problems.push(message);
  }

  exists(relativePath: string): boolean {
    if (existsSync(join(this.root, relativePath))) return true;
    this.problem(`missing file: ${relativePath}`);
    return false;
  }

  json(relativePath: string): unknown {
    if (!this.exists(relativePath)) return undefined;
    try {
      return JSON.parse(readFileSync(join(this.root, relativePath), 'utf8'));
    } catch (error) {
      this.problem(
        `${relativePath}: invalid JSON (${error instanceof Error ? error.message : String(error)})`,
      );
      return undefined;
    }
  }

  png(relativePath: string): PngInfo | undefined {
    if (!this.exists(relativePath)) return undefined;
    const size = readPngSize(readFileSync(join(this.root, relativePath)));
    if (size === null) this.problem(`${relativePath}: not a PNG image`);
    return size ?? undefined;
  }

  license(where: string, license: string): void {
    if (!(ALLOWED_LICENSES as readonly string[]).includes(license)) {
      this.problem(`${where}: license "${license}" is not one of ${ALLOWED_LICENSES.join(', ')}`);
    }
  }
}

function layerNames(tmj: unknown): Map<string, string> {
  const names = new Map<string, string>();
  if (typeof tmj !== 'object' || tmj === null || !('layers' in tmj) || !Array.isArray(tmj.layers))
    return names;
  for (const layer of tmj.layers as unknown[]) {
    if (typeof layer === 'object' && layer !== null && 'name' in layer && 'type' in layer) {
      names.set(String(layer.name), String(layer.type));
    }
  }
  return names;
}

function checkMap(c: Checker, template: ManifestTemplate): WorldMap | undefined {
  const file = `templates/${template.dir}/map.tmj`;
  const tmj = c.json(file);
  if (tmj === undefined) return undefined;
  const layers = layerNames(tmj);
  for (const name of DECOR_TILE_LAYERS) {
    if (layers.get(name) !== 'tilelayer') c.problem(`${file}: missing tile layer "${name}"`);
  }
  let map: WorldMap;
  try {
    map = parseMap(tmj);
  } catch (error) {
    if (!(error instanceof MapParseError)) throw error;
    for (const problem of error.problems) c.problem(`${file}: ${problem}`);
    return undefined;
  }
  if (map.spawns.length < MIN_SPAWNS) {
    c.problem(
      `${file}: needs at least ${String(MIN_SPAWNS)} spawn points, found ${String(map.spawns.length)}`,
    );
  }
  for (const desk of map.desks) {
    const walkable = tilesOf(desk).filter((tile) => isWalkable(map, tile.x, tile.y));
    if (walkable.length > 0) {
      const where = walkable.map((t) => `(${String(t.x)},${String(t.y)})`).join(' ');
      c.problem(
        `${file}: desk "${desk.deskId}" must be over blocking furniture, walkable tiles ${where}`,
      );
    }
  }
  return map;
}

function checkThemes(c: Checker, template: ManifestTemplate, map: WorldMap | undefined): void {
  if (template.themes.length < MIN_THEMES) {
    c.problem(
      `manifest.json: template "${template.id}" needs at least ${String(MIN_THEMES)} themes, found ${String(template.themes.length)}`,
    );
  }
  const themes = new Map<string, ThemeFile>();
  for (const theme of template.themes) {
    const dir = `templates/${template.dir}/themes/${theme.id}`;
    const raw = c.json(`${dir}/theme.json`);
    if (raw === undefined) continue;
    const parsed = ThemeFileSchema.safeParse(raw);
    if (!parsed.success) {
      c.problem(
        `${dir}/theme.json: ${parsed.error.issues.map((i) => `${i.path.join('.')} ${i.message}`).join('; ')}`,
      );
      continue;
    }
    themes.set(theme.id, parsed.data);
    c.license(`${dir}/theme.json`, parsed.data.license);
    c.png(`${dir}/thumbnail.png`);
    if (parsed.data.baseThemeId !== undefined) continue;
    for (const image of ['below.png', 'above.png']) {
      const size = c.png(`${dir}/${image}`);
      if (size === undefined) continue;
      if (size.width > MAX_THEME_IMAGE_PX || size.height > MAX_THEME_IMAGE_PX) {
        c.problem(
          `${dir}/${image}: ${String(size.width)}x${String(size.height)} px exceeds ${String(MAX_THEME_IMAGE_PX)} px per side`,
        );
      }
      if (map !== undefined) {
        const expected = { width: map.width * TILE_SIZE, height: map.height * TILE_SIZE };
        if (size.width !== expected.width || size.height !== expected.height) {
          c.problem(
            `${dir}/${image}: is ${String(size.width)}x${String(size.height)} px, the map needs ${String(expected.width)}x${String(expected.height)} px`,
          );
        }
      }
    }
  }
  // Color variants reuse the images of another theme of the same template.
  for (const [id, theme] of themes) {
    if (theme.baseThemeId === undefined) continue;
    const where = `templates/${template.dir}/themes/${id}/theme.json`;
    const base = themes.get(theme.baseThemeId);
    if (base === undefined)
      c.problem(`${where}: baseThemeId "${theme.baseThemeId}" is not a theme of this template`);
    else if (base.baseThemeId !== undefined)
      c.problem(`${where}: baseThemeId must point to a theme with its own images`);
    if (theme.colorMatrix === undefined) c.problem(`${where}: a color variant needs a colorMatrix`);
  }
}

/** Runs every check on the maps package folder `root`. */
export function validateMapsPackage(root: string): ValidationReport {
  const c = new Checker(root);
  const raw = c.json('manifest.json');
  if (raw === undefined) return { problems: c.problems, manifest: null };
  const parsed = MapsManifestSchema.safeParse(raw);
  if (!parsed.success) {
    c.problem(
      `manifest.json: ${parsed.error.issues.map((i) => `${i.path.join('.')} ${i.message}`).join('; ')}`,
    );
    return { problems: c.problems, manifest: null };
  }
  const manifest = parsed.data;
  c.exists('LICENSES.md');

  for (const template of manifest.templates) {
    if (!template.id.startsWith(`${template.dir}@`)) {
      c.problem(
        `manifest.json: template "${template.id}" must live in templates/${template.id.split('@')[0] ?? ''}`,
      );
    }
    const map = checkMap(c, template);
    checkThemes(c, template, map);
  }
  for (const avatar of manifest.avatars) {
    const file = `avatars/${avatar.file}`;
    c.license(file, avatar.credit.license);
    const size = c.png(file);
    const expected = {
      width: avatar.frameWidth * AVATAR_COLUMNS,
      height: avatar.frameHeight * AVATAR_ROWS,
    };
    if (size !== undefined && (size.width !== expected.width || size.height !== expected.height)) {
      c.problem(
        `${file}: is ${String(size.width)}x${String(size.height)} px, expected ${String(expected.width)}x${String(expected.height)} (3 frames × 4 directions)`,
      );
    }
  }
  for (const item of manifest.decor) {
    const file = `decor/${item.file}`;
    c.license(file, item.credit.license);
    const size = c.png(file);
    if (
      size !== undefined &&
      (size.width !== size.height || !(DECOR_SIZES as readonly number[]).includes(size.width))
    ) {
      c.problem(
        `${file}: is ${String(size.width)}x${String(size.height)} px, expected 16x16 or 32x32`,
      );
    }
  }
  return { problems: c.problems, manifest };
}
