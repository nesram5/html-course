import { SlugIdSchema, parseMap, type WorldMap } from '@plaza/shared';
import { z } from 'zod';

/** Map assets are served by the server (and proxied by Vite in development) under this path. */
export const MAPS_BASE_URL = '/assets/maps';

/** `office-small@1` → `office-small` (templates live in `templates/<dir>/`, ADR-006). */
export function templateDir(mapTemplateId: string): string {
  return mapTemplateId.split('@')[0] ?? mapTemplateId;
}

export function mapUrl(mapTemplateId: string): string {
  return `${MAPS_BASE_URL}/templates/${templateDir(mapTemplateId)}/map.tmj`;
}

export function themeUrl(mapTemplateId: string, themeId: string, file: string): string {
  return `${MAPS_BASE_URL}/templates/${templateDir(mapTemplateId)}/themes/${themeId}/${file}`;
}

/** Sprite sheet of an avatar of the catalog (`avatars/<id>.png`). */
export function avatarUrl(avatarId: string): string {
  return `${MAPS_BASE_URL}/avatars/${avatarId}.png`;
}

/** Sprite of a desk decoration object of the catalog (`decor/<id>.png`, E9-S3). */
export function decorUrl(itemId: string): string {
  return `${MAPS_BASE_URL}/decor/${itemId}.png`;
}

/** The fields of `theme.json` the client needs (full schema: `@plaza/maps` `ThemeFileSchema`). */
const ThemeJsonSchema = z.looseObject({
  baseThemeId: SlugIdSchema.optional(),
  colorMatrix: z.array(z.number()).length(20).optional(),
});

/** What the world scene needs to draw an office style (architecture §8.1). */
export interface ThemeAssets {
  readonly themeId: string;
  readonly belowUrl: string;
  readonly aboveUrl: string;
  /** 4×5 color matrix of a color variant (Phaser `ColorMatrix` layout), or `null`. */
  readonly colorMatrix: readonly number[] | null;
}

export interface WorldAssets {
  readonly map: WorldMap;
  readonly theme: ThemeAssets;
}

async function fetchJson(url: string, signal?: AbortSignal): Promise<unknown> {
  const response = await fetch(url, {
    credentials: 'include',
    headers: { Accept: 'application/json' },
    ...(signal !== undefined && { signal }),
  });
  if (!response.ok) throw new Error(`GET ${url} failed with ${String(response.status)}`);
  return response.json();
}

/** Resolves a theme into image URLs: a color variant reuses the images of its base theme. */
export async function loadTheme(
  mapTemplateId: string,
  themeId: string,
  signal?: AbortSignal,
): Promise<ThemeAssets> {
  const theme = ThemeJsonSchema.parse(
    await fetchJson(themeUrl(mapTemplateId, themeId, 'theme.json'), signal),
  );
  const imagesFrom = theme.baseThemeId ?? themeId;
  return {
    themeId,
    belowUrl: themeUrl(mapTemplateId, imagesFrom, 'below.png'),
    aboveUrl: themeUrl(mapTemplateId, imagesFrom, 'above.png'),
    colorMatrix: theme.colorMatrix ?? null,
  };
}

/** Downloads and parses the map (`parseMap`, the same code as the server) and its theme. */
export async function loadWorldAssets(
  mapTemplateId: string,
  themeId: string,
  signal?: AbortSignal,
): Promise<WorldAssets> {
  const [tmj, theme] = await Promise.all([
    fetchJson(mapUrl(mapTemplateId), signal),
    loadTheme(mapTemplateId, themeId, signal),
  ]);
  return { map: parseMap(tmj), theme };
}
