import { z } from 'zod';

import { AvatarIdSchema } from './common.js';

/** An avatar of the catalog in `packages/maps/avatars` (4 directions × 3 frames). */
export const AvatarDtoSchema = z.object({
  id: AvatarIdSchema,
  name: z.string(),
  /** Sprite sheet URL (rows: down, left, right, up; 3 frames per row). */
  spriteUrl: z.string(),
  frameWidth: z.number().int().positive(),
  frameHeight: z.number().int().positive(),
});
export type AvatarDto = z.infer<typeof AvatarDtoSchema>;

/** `GET /api/avatars`. */
export const AvatarsResponseSchema = z.object({ avatars: z.array(AvatarDtoSchema) });
export type AvatarsResponse = z.infer<typeof AvatarsResponseSchema>;
