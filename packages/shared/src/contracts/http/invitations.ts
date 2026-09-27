import { z } from 'zod';

import { MapTemplateIdSchema } from './common.js';
import { SpaceNameSchema, SpaceSummaryDtoSchema } from './spaces.js';

/** `POST /api/spaces/:spaceId/invite-link` (owner): regenerates the link, revoking the old one. */
export const InviteLinkResponseSchema = z.object({ url: z.url() });
export type InviteLinkResponse = z.infer<typeof InviteLinkResponseSchema>;

export const JoinParamsSchema = z.object({ token: z.string().min(16).max(128) });
export type JoinParams = z.infer<typeof JoinParamsSchema>;

/** `GET /api/join/:token` (public preview). Invalid or revoked token → 404 `INVALID_INVITE`. */
export const JoinPreviewResponseSchema = z.object({
  space: z.object({
    name: SpaceNameSchema,
    mapTemplateId: MapTemplateIdSchema,
    memberCount: z.number().int().nonnegative(),
  }),
});
export type JoinPreviewResponse = z.infer<typeof JoinPreviewResponseSchema>;

/** `POST /api/join/:token` (requires a session). Idempotent for existing members (E2-S5). */
export const JoinResponseSchema = z.object({
  space: SpaceSummaryDtoSchema,
  alreadyMember: z.boolean(),
});
export type JoinResponse = z.infer<typeof JoinResponseSchema>;
