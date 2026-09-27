import { z } from 'zod';

import { MapTemplateIdSchema, ThemeIdSchema } from './common.js';

/** An office style ("skin") of a template (architecture §8.1, E9-S1). */
export const ThemeDtoSchema = z.object({
  id: ThemeIdSchema,
  name: z.string(),
  thumbnailUrl: z.string(),
  /** Image drawn below the avatars. `null` for a pure color variant of another theme. */
  belowUrl: z.string().nullable(),
  /** Image drawn above the avatars. */
  aboveUrl: z.string().nullable(),
  /** Theme whose images a color variant reuses. */
  baseThemeId: ThemeIdSchema.nullable(),
  /** 4×5 color matrix (20 numbers) applied as a Phaser filter for color variants (plan B). */
  colorMatrix: z.array(z.number()).length(20).nullable(),
});
export type ThemeDto = z.infer<typeof ThemeDtoSchema>;

export const MapTemplateDtoSchema = z.object({
  id: MapTemplateIdSchema,
  name: z.string(),
  thumbnailUrl: z.string(),
  /** URL of the Tiled `.tmj` (the single source of geometry). */
  mapUrl: z.string(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  roomCount: z.number().int().nonnegative(),
  deskCount: z.number().int().nonnegative(),
  themes: z.array(ThemeDtoSchema).min(1),
});
export type MapTemplateDto = z.infer<typeof MapTemplateDtoSchema>;

/** `GET /api/map-templates`. */
export const MapTemplatesResponseSchema = z.object({ templates: z.array(MapTemplateDtoSchema) });
export type MapTemplatesResponse = z.infer<typeof MapTemplatesResponseSchema>;
