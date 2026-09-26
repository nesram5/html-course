import { z } from 'zod';

import {
  AvatarIdSchema,
  DeskIdSchema,
  IdSchema,
  IsoDateTimeSchema,
  PresenceStatusSchema,
  RoleSchema,
} from './common.js';

export const MemberDtoSchema = z.object({
  userId: IdSchema,
  displayName: z.string(),
  avatarId: AvatarIdSchema,
  /** Only visible to owners (E2-S6); `null` for members. */
  email: z.email().nullable(),
  role: RoleSchema,
  /** Status chosen by the person, persisted in `Membership.status` (E7-S1). */
  status: PresenceStatusSchema,
  deskId: DeskIdSchema.nullable(),
  joinedAt: IsoDateTimeSchema,
});
export type MemberDto = z.infer<typeof MemberDtoSchema>;

/** `GET /api/spaces/:spaceId/members` (members). Online state comes from realtime. */
export const MembersResponseSchema = z.object({ members: z.array(MemberDtoSchema) });
export type MembersResponse = z.infer<typeof MembersResponseSchema>;

/**
 * `DELETE /api/spaces/:spaceId/members/:userId` (owner) → 204. The member is disconnected with
 * `space:kicked` and their desk is freed. Removing the last owner → 409 `LAST_OWNER`.
 */
export const MemberParamsSchema = z.object({ spaceId: IdSchema, userId: IdSchema });
export type MemberParams = z.infer<typeof MemberParamsSchema>;
