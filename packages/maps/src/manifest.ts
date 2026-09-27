import { MapTemplateIdSchema, SlugIdSchema } from '@plaza/shared';
import { z } from 'zod';

/** A license entry: every asset must declare where it comes from (LICENSES.md). */
export const AssetLicenseSchema = z.object({
  author: z.string().min(1),
  /** SPDX id or short name, e.g. `CC0-1.0`. */
  license: z.string().min(1),
  source: z.url().optional(),
});
export type AssetLicense = z.infer<typeof AssetLicenseSchema>;

/**
 * A theme ("skin") of a template, stored in `templates/<dir>/themes/<themeId>/` with
 * `below.png`, `above.png`, `thumbnail.png` and `theme.json` (architecture §8.1).
 */
export const ManifestThemeSchema = z.object({
  id: SlugIdSchema,
  /** Display name (Spanish). The web may override it with the i18n key `catalog:themes.<id>`. */
  name: z.string().min(1),
});
export type ManifestTheme = z.infer<typeof ManifestThemeSchema>;

/** A map template in `templates/<dir>/` (`map.tmj` + `themes/`). */
export const ManifestTemplateSchema = z.object({
  /** Versioned id, e.g. `office-small@1` (ADR-006). Changing geometry means a new version. */
  id: MapTemplateIdSchema,
  /** Folder under `templates/`, e.g. `office-small`. */
  dir: SlugIdSchema,
  /** Display name (Spanish), e.g. "Oficina pequeña". i18n override: `catalog:templates.<dir>`. */
  name: z.string().min(1),
  defaultThemeId: SlugIdSchema,
  themes: z.array(ManifestThemeSchema).min(1),
});
export type ManifestTemplate = z.infer<typeof ManifestTemplateSchema>;

/** An avatar sprite sheet in `avatars/<file>`: 4 rows (down, left, right, up) × 3 frames. */
export const ManifestAvatarSchema = z.object({
  id: SlugIdSchema,
  name: z.string().min(1),
  file: z.string().regex(/^[a-z0-9_-]+\.png$/),
  frameWidth: z.number().int().positive(),
  frameHeight: z.number().int().positive(),
  credit: AssetLicenseSchema,
});
export type ManifestAvatar = z.infer<typeof ManifestAvatarSchema>;

/** A desk decoration object in `decor/<file>` (neutral sprite that fits every theme). */
export const ManifestDecorItemSchema = z.object({
  id: SlugIdSchema,
  name: z.string().min(1),
  file: z.string().regex(/^[a-z0-9_-]+\.png$/),
  credit: AssetLicenseSchema,
});
export type ManifestDecorItem = z.infer<typeof ManifestDecorItemSchema>;

function uniqueBy<T>(items: readonly T[], key: (item: T) => string): boolean {
  return new Set(items.map(key)).size === items.length;
}

export const MapsManifestSchema = z
  .object({
    $comment: z.string().optional(),
    version: z.literal(1),
    templates: z.array(ManifestTemplateSchema),
    avatars: z.array(ManifestAvatarSchema),
    decor: z.array(ManifestDecorItemSchema),
  })
  .refine((m) => uniqueBy(m.templates, (t) => t.id), { message: 'duplicate template id' })
  .refine((m) => uniqueBy(m.avatars, (a) => a.id), { message: 'duplicate avatar id' })
  .refine((m) => uniqueBy(m.decor, (d) => d.id), { message: 'duplicate decor id' })
  .refine(
    (m) =>
      m.templates.every(
        (t) =>
          uniqueBy(t.themes, (th) => th.id) && t.themes.some((th) => th.id === t.defaultThemeId),
      ),
    { message: 'each template needs unique theme ids and must include its defaultThemeId' },
  );
export type MapsManifest = z.infer<typeof MapsManifestSchema>;

/** `theme.json` inside each theme folder. */
export const ThemeFileSchema = z.object({
  name: z.string().min(1),
  author: z.string().min(1),
  license: z.string().min(1),
  /** Color variant (plan B): reuse the images of another theme with a 4×5 color matrix. */
  baseThemeId: SlugIdSchema.optional(),
  colorMatrix: z.array(z.number()).length(20).optional(),
});
export type ThemeFile = z.infer<typeof ThemeFileSchema>;

export function parseManifest(json: unknown): MapsManifest {
  return MapsManifestSchema.parse(json);
}
