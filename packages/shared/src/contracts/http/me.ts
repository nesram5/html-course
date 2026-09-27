import { z } from 'zod';

import { DISPLAY_NAME_MAX_LEN } from '../../constants.js';
import { AvatarIdSchema, IdSchema, nameSchema } from './common.js';

export const DisplayNameSchema = nameSchema(DISPLAY_NAME_MAX_LEN);

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
  /** Listed in `ADMIN_EMAILS`: may open the metrics page (E8-S7). Only sent by `GET /api/me`. */
  isAdmin: z.boolean().optional(),
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

const SpaceRefSchema = z.object({ id: IdSchema, name: z.string() });

/**
 * `GET /api/me/deletion` (E8-S6): what "Borrar mi cuenta" would do.
 * - `blockingSpaces`: spaces where I am the only owner and other people are members. The account
 *   cannot be deleted until they have no other members (409 `SOLE_OWNER`).
 * - `spacesDeleted`: spaces where I am the only member; they are deleted with the account.
 */
export const AccountDeletionPreviewSchema = z.object({
  blockingSpaces: z.array(SpaceRefSchema),
  spacesDeleted: z.array(SpaceRefSchema),
});
export type AccountDeletionPreview = z.infer<typeof AccountDeletionPreviewSchema>;

/**
 * `DELETE /api/me` → 204 (E8-S6): deletes my profile, sessions, memberships (freeing my desks),
 * bans and feedback, and the spaces where I was the only member; my chat messages stay as
 * "Usuario eliminado". Sole owner of a space with other members → 409 `SOLE_OWNER`.
 */
