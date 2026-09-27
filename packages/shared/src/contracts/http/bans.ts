import { z } from 'zod';

import { AvatarIdSchema, IdSchema, IsoDateTimeSchema } from './common.js';

/**
 * A person removed from the space by an owner (E2-S6 follow-up). While banned, neither an invite
 * link nor the allowed domain lets them in again (`403 BANNED_FROM_SPACE`).
 */
export const SpaceBanDtoSchema = z.object({
  userId: IdSchema,
  displayName: z.string(),
  avatarId: AvatarIdSchema,
  email: z.email(),
  createdAt: IsoDateTimeSchema,
});
export type SpaceBanDto = z.infer<typeof SpaceBanDtoSchema>;

/** `GET /api/spaces/:spaceId/bans` (owner): removed people, newest first. */
export const SpaceBansResponseSchema = z.object({ bans: z.array(SpaceBanDtoSchema) });
export type SpaceBansResponse = z.infer<typeof SpaceBansResponseSchema>;

/**
 * `DELETE /api/spaces/:spaceId/bans/:userId` (owner) → 204: the person may join again with the
 * invite link or the allowed domain. Not banned → 404 `NOT_FOUND`.
 */
export const SpaceBanParamsSchema = z.object({ spaceId: IdSchema, userId: IdSchema });
export type SpaceBanParams = z.infer<typeof SpaceBanParamsSchema>;
