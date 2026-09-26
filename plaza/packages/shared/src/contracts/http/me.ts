import { z } from 'zod';

import { DISPLAY_NAME_MAX_LEN } from '../../constants.js';
import { AvatarIdSchema, IdSchema } from './common.js';

export const DisplayNameSchema = z.string().trim().min(1).max(DISPLAY_NAME_MAX_LEN);

/** The signed-in user (`GET /api/me`). */
export const MeSchema = z.object({
  id: IdSchema,
  email: z.email(),
  displayName: DisplayNameSchema,
  avatarId: AvatarIdSchema,
  /** `false` until the person picks an avatar: the picker is shown before the map (E1-S4). */
  avatarChosen: z.boolean(),
  /** Google profile picture, if any. */
  pictureUrl: z.url().nullable(),
});
export type Me = z.infer<typeof MeSchema>;

export const MeResponseSchema = z.object({ user: MeSchema });
export type MeResponse = z.infer<typeof MeResponseSchema>;

/** `PATCH /api/me`: unknown `avatarId` → 400 `UNKNOWN_AVATAR` (E1-S4). */
export const UpdateMeBodySchema = z
  .object({
    displayName: DisplayNameSchema.optional(),
    avatarId: AvatarIdSchema.optional(),
  })
  .refine((body) => body.displayName !== undefined || body.avatarId !== undefined, {
    message: 'at least one field is required',
  });
export type UpdateMeBody = z.infer<typeof UpdateMeBodySchema>;

// `DELETE /api/me` → 204 (E8-S6: deletes the account; chat messages stay as "deleted user").
