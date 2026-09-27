/**
 * Procedural generator of every asset of `@bululu/maps` (templates, themes, avatars, decor and
 * `manifest.json`). There is no hand-drawn art: `pnpm --filter @bululu/maps generate` rebuilds the
 * committed files byte for byte (same Node.js/zlib version), and a test checks it.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { encodePng } from '../lib/png.js';
import { AVATAR_FRAME, AVATARS, drawAvatarSheet } from './avatars.js';
import { DECOR, drawDecor } from './decor.js';
import { toPrettyJson, toTiledJson, type Json } from './json.js';
import type { BuiltMap } from './map-builder.js';
import { Raster } from './raster.js';
import { TEMPLATES, type TemplateSpec } from './templates.js';
import { TILE, TILESET_COLUMNS, pixelTileset, type Tileset } from './tileset.js';
import { watercolorBelow, watercolorObjects } from './watercolor.js';

export const GENERATED_AUTHOR = 'Plaza (procedural, packages/maps/scripts/generator)';
export const GENERATED_LICENSE = 'CC0-1.0';
const TILESET_FILE = 'tilesets/pixel-office.png';

/**
 * "Noche" color variant (plan B of architecture §8.1): Phaser `ColorMatrix` layout, 4 rows of
 * `[r, g, b, a, offset]` with offsets in 0..255 units.
 */
export const NIGHT_COLOR_MATRIX = [
  0.5, 0.08, 0.12, 0, 0, 0.06, 0.55, 0.16, 0, 4, 0.1, 0.14, 0.82, 0, 22, 0, 0, 0, 1, 0,
] as const;

/** Office styles of every template, in the order the settings show them (E9-S1). */
export const THEMES = [
  { id: 'pixel', name: 'Pixel' },
  { id: 'night', name: 'Noche' },
  { id: 'watercolor', name: 'Acuarela' },
] as const;

export interface GeneratedFile {
  /** Path relative to the package root, with `/` separators. */
  readonly path: string;
  readonly bytes: Buffer;
}

function png(raster: Raster): Buffer {
  return encodePng(raster.width, raster.height, raster.data);
}

function text(content: string): Buffer {
  return Buffer.from(content, 'utf8');
}

function rasterize(
  map: BuiltMap,
  tileset: Tileset,
  layers: readonly (readonly number[])[],
): Raster {
  const out = new Raster(map.width * TILE, map.height * TILE);
  for (const layer of layers) {
    layer.forEach((gid, i) => {
      if (gid !== 0)
        out.draw(tileset.tile(gid), (i % map.width) * TILE, Math.floor(i / map.width) * TILE);
    });
  }
  return out;
}

function tmjOf(map: BuiltMap, tileset: Tileset): Json {
  let objectId = 0;
  const nextId = () => ++objectId;
  const tileLayer = (id: number, name: string, data: readonly number[], visible = true): Json => ({
    data: [...data],
    height: map.height,
    id,
    name,
    opacity: 1,
    type: 'tilelayer',
    visible,
    width: map.width,
    x: 0,
    y: 0,
  });
  const objectLayer = (id: number, name: string, objects: Json[]): Json => ({
    draworder: 'topdown',
    id,
    name,
    objects,
    opacity: 1,
    type: 'objectgroup',
    visible: true,
    x: 0,
    y: 0,
  });
  const rect = (r: { x: number; y: number; width: number; height: number }) => ({
    x: r.x * TILE,
    y: r.y * TILE,
    width: r.width * TILE,
    height: r.height * TILE,
  });
  const rooms = map.rooms.map((room) => ({
    id: nextId(),
    name: room.name,
    properties: [
      { name: 'areaId', type: 'string', value: room.areaId },
      { name: 'name', type: 'string', value: room.name },
    ],
    rotation: 0,
    type: '',
    visible: true,
    ...rect(room),
  }));
  const spawns = map.spawns.map((spawn, i) => ({
    id: nextId(),
    name: `spawn-${String(i + 1)}`,
    point: true,
    rotation: 0,
    type: '',
    visible: true,
    x: spawn.x * TILE + TILE / 2,
    y: spawn.y * TILE + TILE / 2,
    width: 0,
    height: 0,
  }));
  const desks = map.desks.map((desk) => ({
    id: nextId(),
    name: desk.deskId,
    properties: [{ name: 'deskId', type: 'string', value: desk.deskId }],
    rotation: 0,
    type: '',
    visible: true,
    ...rect(desk),
  }));
  const rows = Math.ceil(tileset.names.length / TILESET_COLUMNS);
  return {
    compressionlevel: -1,
    height: map.height,
    infinite: false,
    layers: [
      tileLayer(1, 'floor', map.floor),
      tileLayer(2, 'decor-below', map.decorBelow),
      tileLayer(3, 'decor-above', map.decorAbove),
      tileLayer(4, 'collision', map.collision, false),
      objectLayer(5, 'rooms', rooms),
      objectLayer(6, 'spawns', spawns),
      objectLayer(7, 'desks', desks),
    ],
    nextlayerid: 8,
    nextobjectid: objectId + 1,
    orientation: 'orthogonal',
    renderorder: 'right-down',
    tiledversion: '1.11.0',
    tileheight: TILE,
    tilesets: [
      {
        columns: TILESET_COLUMNS,
        firstgid: 1,
        image: `../../${TILESET_FILE}`,
        imageheight: rows * TILE,
        imagewidth: TILESET_COLUMNS * TILE,
        margin: 0,
        name: 'pixel-office',
        spacing: 0,
        tilecount: tileset.names.length,
        tileheight: TILE,
        tilewidth: TILE,
      },
    ],
    tilewidth: TILE,
    type: 'map',
    version: '1.10',
    width: map.width,
  };
}

function templateFiles(spec: TemplateSpec, tileset: Tileset): GeneratedFile[] {
  const map = spec.build(tileset);
  const base = `templates/${spec.dir}`;
  const below = rasterize(map, tileset, [map.floor, map.decorBelow]);
  const above = rasterize(map, tileset, [map.decorAbove]);
  const composite = new Raster(below.width, below.height);
  composite.draw(below, 0, 0);
  composite.draw(above, 0, 0);
  const thumbnail = composite.downscale(spec.thumbnailScale);
  const nightThumbnail = thumbnail.crop(0, 0, thumbnail.width, thumbnail.height);
  nightThumbnail.applyColorMatrix(NIGHT_COLOR_MATRIX);
  const paintedBelow = watercolorBelow(
    rasterize(map, tileset, [map.floor]),
    rasterize(map, tileset, [map.decorBelow]),
  );
  const paintedAbove = watercolorObjects(above);
  const painted = new Raster(below.width, below.height);
  painted.draw(paintedBelow, 0, 0);
  painted.draw(paintedAbove, 0, 0);
  const theme = (name: string, extra: Record<string, Json> = {}) =>
    text(toPrettyJson({ name, author: GENERATED_AUTHOR, license: GENERATED_LICENSE, ...extra }));
  return [
    { path: `${base}/map.tmj`, bytes: text(toTiledJson(tmjOf(map, tileset), map.width)) },
    { path: `${base}/themes/pixel/below.png`, bytes: png(below) },
    { path: `${base}/themes/pixel/above.png`, bytes: png(above) },
    { path: `${base}/themes/pixel/thumbnail.png`, bytes: png(thumbnail) },
    { path: `${base}/themes/pixel/theme.json`, bytes: theme('Pixel') },
    { path: `${base}/themes/night/thumbnail.png`, bytes: png(nightThumbnail) },
    {
      path: `${base}/themes/night/theme.json`,
      bytes: theme('Noche', { baseThemeId: 'pixel', colorMatrix: [...NIGHT_COLOR_MATRIX] }),
    },
    { path: `${base}/themes/watercolor/below.png`, bytes: png(paintedBelow) },
    { path: `${base}/themes/watercolor/above.png`, bytes: png(paintedAbove) },
    {
      path: `${base}/themes/watercolor/thumbnail.png`,
      bytes: png(painted.downscale(spec.thumbnailScale)),
    },
    { path: `${base}/themes/watercolor/theme.json`, bytes: theme('Acuarela') },
  ];
}

function manifest(): Json {
  const credit = { author: GENERATED_AUTHOR, license: GENERATED_LICENSE };
  return {
    $comment:
      'Catalog of map templates, avatars and desk decoration. Formats: README.md. Validated by `pnpm validate:maps`. GENERATED by `pnpm --filter @bululu/maps generate`: edit scripts/generator, not this file.',
    version: 1,
    templates: TEMPLATES.map((spec) => ({
      id: `${spec.dir}@${String(spec.version)}`,
      dir: spec.dir,
      name: spec.name,
      defaultThemeId: 'pixel',
      themes: THEMES.map((theme) => ({ id: theme.id, name: theme.name })),
    })),
    avatars: AVATARS.map((avatar) => ({
      id: avatar.id,
      name: avatar.name,
      file: `${avatar.id}.png`,
      frameWidth: AVATAR_FRAME,
      frameHeight: AVATAR_FRAME,
      credit,
    })),
    decor: DECOR.map((item) => ({ id: item.id, name: item.name, file: `${item.id}.png`, credit })),
  };
}

/** Every generated file, in memory. Deterministic. */
export function generateAll(): GeneratedFile[] {
  const tileset = pixelTileset();
  return [
    { path: TILESET_FILE, bytes: png(tileset.image()) },
    ...TEMPLATES.flatMap((spec) => templateFiles(spec, tileset)),
    ...AVATARS.map((avatar) => ({
      path: `avatars/${avatar.id}.png`,
      bytes: png(drawAvatarSheet(avatar)),
    })),
    ...DECOR.map((item) => ({ path: `decor/${item.id}.png`, bytes: png(drawDecor(item)) })),
    { path: 'manifest.json', bytes: text(toPrettyJson(manifest())) },
  ];
}

/** Writes the files under `root` (the package folder). */
export function writeAll(root: string, files: readonly GeneratedFile[]): void {
  for (const file of files) {
    const target = join(root, file.path);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, file.bytes);
  }
}
