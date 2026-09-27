import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

import {
  parseManifest,
  ThemeFileSchema,
  type MapsManifest,
  type ManifestTemplate,
} from '@bululu/maps';
import {
  parseMap,
  type AvatarDto,
  type DecorItemDto,
  type MapTemplateDto,
  type ThemeDto,
  type WorldMap,
} from '@bululu/shared';

/** Public URL prefix under which the server serves the maps package (see `app.ts`). */
export const MAP_ASSETS_PREFIX = '/assets/maps';

/** A meeting room of a template (`rooms` layer of its map). */
export interface MapRoomArea {
  areaId: string;
  name: string;
}

/**
 * Read-only catalog of `@bululu/maps`: templates, their meeting rooms and themes, and avatars.
 * Injected through the container so tests can use a fixture catalog (`src/test/maps-fixture.ts`).
 */
export interface MapsCatalog {
  listTemplates(): Promise<MapTemplateDto[]>;
  hasTemplate(templateId: string): boolean;
  /** Theme used by new spaces of the template, `null` for unknown templates. */
  defaultThemeId(templateId: string): string | null;
  hasTheme(templateId: string, themeId: string): boolean;
  /** Thumbnail of a template theme, `null` when the template or theme is unknown. */
  thumbnailUrl(templateId: string, themeId: string): string | null;
  /** Meeting rooms of the template map. Throws when the template or its map is invalid. */
  roomAreas(templateId: string): Promise<readonly MapRoomArea[]>;
  /**
   * The whole parsed map of the template (collisions, rooms, spawns, desks), parsed once and
   * cached. Throws when the template or its map is invalid. Used by the world runtime (E4-S2).
   */
  worldMap(templateId: string): Promise<WorldMap>;
  listAvatars(): AvatarDto[];
  hasAvatar(avatarId: string): boolean;
  /** Desk decoration catalog (E9-S3): ids, Spanish names and sprite URLs. */
  listDecor(): DecorItemDto[];
}

/** Folder of the `@bululu/maps` package (manifest, templates, avatars, decor). */
export function mapsPackageDir(): string {
  const require = createRequire(import.meta.url);
  return dirname(require.resolve('@bululu/maps/package.json'));
}

export interface ManifestCatalogFiles {
  /** Reads a JSON file relative to the maps folder, e.g. `templates/office-small/map.tmj`. */
  readJson(relativePath: string): unknown;
}

interface ParsedTemplate {
  width: number;
  height: number;
  rooms: readonly MapRoomArea[];
  deskCount: number;
}

/** {@link MapsCatalog} backed by `manifest.json` and the files next to it. */
export class ManifestMapsCatalog implements MapsCatalog {
  readonly #templates: Map<string, ManifestTemplate>;
  readonly #parsed = new Map<string, ParsedTemplate>();
  readonly #maps = new Map<string, WorldMap>();

  constructor(
    private readonly manifest: MapsManifest,
    private readonly files: ManifestCatalogFiles,
    /** Tiled parser, `parseMap` of `@bululu/shared` by default. */
    private readonly parse: (tmj: unknown) => WorldMap = parseMap,
  ) {
    this.#templates = new Map(manifest.templates.map((template) => [template.id, template]));
  }

  /** Loads `<dir>/manifest.json` from disk. */
  static fromDir(dir: string): ManifestMapsCatalog {
    const files: ManifestCatalogFiles = {
      readJson: (relativePath): unknown =>
        JSON.parse(readFileSync(join(dir, relativePath), 'utf8')),
    };
    return new ManifestMapsCatalog(parseManifest(files.readJson('manifest.json')), files);
  }

  #template(templateId: string): ManifestTemplate | undefined {
    return this.#templates.get(templateId);
  }

  #themeBase(template: ManifestTemplate, themeId: string): string {
    return `${MAP_ASSETS_PREFIX}/templates/${template.dir}/themes/${themeId}`;
  }

  #worldMap(template: ManifestTemplate): WorldMap {
    const cached = this.#maps.get(template.id);
    if (cached !== undefined) return cached;
    const map = this.parse(this.files.readJson(`templates/${template.dir}/map.tmj`));
    this.#maps.set(template.id, map);
    return map;
  }

  #parsedTemplate(template: ManifestTemplate): ParsedTemplate {
    const cached = this.#parsed.get(template.id);
    if (cached !== undefined) return cached;
    const map = this.#worldMap(template);
    const parsed: ParsedTemplate = {
      width: map.width,
      height: map.height,
      rooms: map.rooms.map((room) => ({ areaId: room.areaId, name: room.name })),
      deskCount: map.desks.length,
    };
    this.#parsed.set(template.id, parsed);
    return parsed;
  }

  #theme(template: ManifestTemplate, themeId: string, name: string): ThemeDto {
    const file = ThemeFileSchema.parse(
      this.files.readJson(`templates/${template.dir}/themes/${themeId}/theme.json`),
    );
    const base = this.#themeBase(template, themeId);
    const imageBase =
      file.baseThemeId === undefined ? base : this.#themeBase(template, file.baseThemeId);
    return {
      id: themeId,
      name,
      thumbnailUrl: `${base}/thumbnail.png`,
      belowUrl: `${imageBase}/below.png`,
      aboveUrl: `${imageBase}/above.png`,
      baseThemeId: file.baseThemeId ?? null,
      colorMatrix: file.colorMatrix ?? null,
    };
  }

  listTemplates(): Promise<MapTemplateDto[]> {
    return Promise.resolve(
      this.manifest.templates.map((template) => {
        const parsed = this.#parsedTemplate(template);
        return {
          id: template.id,
          name: template.name,
          thumbnailUrl: `${this.#themeBase(template, template.defaultThemeId)}/thumbnail.png`,
          mapUrl: `${MAP_ASSETS_PREFIX}/templates/${template.dir}/map.tmj`,
          width: parsed.width,
          height: parsed.height,
          roomCount: parsed.rooms.length,
          deskCount: parsed.deskCount,
          themes: template.themes.map((theme) => this.#theme(template, theme.id, theme.name)),
        };
      }),
    );
  }

  hasTemplate(templateId: string): boolean {
    return this.#templates.has(templateId);
  }

  defaultThemeId(templateId: string): string | null {
    return this.#template(templateId)?.defaultThemeId ?? null;
  }

  hasTheme(templateId: string, themeId: string): boolean {
    return this.#template(templateId)?.themes.some((theme) => theme.id === themeId) ?? false;
  }

  thumbnailUrl(templateId: string, themeId: string): string | null {
    const template = this.#template(templateId);
    if (template === undefined || !this.hasTheme(templateId, themeId)) return null;
    return `${this.#themeBase(template, themeId)}/thumbnail.png`;
  }

  roomAreas(templateId: string): Promise<readonly MapRoomArea[]> {
    const template = this.#template(templateId);
    if (template === undefined) {
      return Promise.reject(new Error(`Unknown map template "${templateId}"`));
    }
    try {
      return Promise.resolve(this.#parsedTemplate(template).rooms);
    } catch (error) {
      return Promise.reject(error instanceof Error ? error : new Error(String(error)));
    }
  }

  worldMap(templateId: string): Promise<WorldMap> {
    const template = this.#template(templateId);
    if (template === undefined) {
      return Promise.reject(new Error(`Unknown map template "${templateId}"`));
    }
    try {
      return Promise.resolve(this.#worldMap(template));
    } catch (error) {
      return Promise.reject(error instanceof Error ? error : new Error(String(error)));
    }
  }

  listAvatars(): AvatarDto[] {
    return this.manifest.avatars.map((avatar) => ({
      id: avatar.id,
      name: avatar.name,
      spriteUrl: `${MAP_ASSETS_PREFIX}/avatars/${avatar.file}`,
      frameWidth: avatar.frameWidth,
      frameHeight: avatar.frameHeight,
    }));
  }

  hasAvatar(avatarId: string): boolean {
    return this.manifest.avatars.some((avatar) => avatar.id === avatarId);
  }

  listDecor(): DecorItemDto[] {
    return this.manifest.decor.map((item) => ({
      id: item.id,
      name: item.name,
      spriteUrl: `${MAP_ASSETS_PREFIX}/decor/${item.file}`,
    }));
  }
}
