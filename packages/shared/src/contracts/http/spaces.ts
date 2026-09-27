import { z } from 'zod';

import { SPACE_NAME_MAX_LEN } from '../../constants.js';
import {
  IdSchema,
  IsoDateTimeSchema,
  MapTemplateIdSchema,
  nameSchema,
  RoleSchema,
  ThemeIdSchema,
} from './common.js';
import { MeetingRoomDtoSchema } from './rooms.js';

export const SpaceNameSchema = nameSchema(SPACE_NAME_MAX_LEN);

/** A lowercase e-mail domain such as `acme.com` (E2-S4). */
export const AllowedDomainSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^(?=.{3,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/, 'invalid domain');

export const SpaceSlugSchema = z
  .string()
  .min(1)
  .max(80)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);

/** A space in "My spaces". */
export const SpaceSummaryDtoSchema = z.object({
  id: IdSchema,
  name: SpaceNameSchema,
  slug: SpaceSlugSchema,
  mapTemplateId: MapTemplateIdSchema,
  themeId: ThemeIdSchema,
  role: RoleSchema,
  /** Thumbnail of the current theme, `null` if the template is gone. */
  thumbnailUrl: z.string().nullable(),
});
export type SpaceSummaryDto = z.infer<typeof SpaceSummaryDtoSchema>;

/** Full space as seen by a member. */
export const SpaceDetailDtoSchema = SpaceSummaryDtoSchema.extend({
  ownerId: IdSchema,
  allowedDomain: z.string().nullable(),
  createdAt: IsoDateTimeSchema,
  rooms: z.array(MeetingRoomDtoSchema),
  /** `/join/<token>` URL. Only filled for owners, `null` for members. */
  inviteUrl: z.url().nullable(),
});
export type SpaceDetailDto = z.infer<typeof SpaceDetailDtoSchema>;

/** `GET /api/spaces`. */
export const SpacesResponseSchema = z.object({ spaces: z.array(SpaceSummaryDtoSchema) });
export type SpacesResponse = z.infer<typeof SpacesResponseSchema>;

/** `POST /api/spaces` → 201. Unknown template → 400 `UNKNOWN_MAP_TEMPLATE` (E2-S2). */
export const CreateSpaceBodySchema = z.object({
  name: SpaceNameSchema,
  mapTemplateId: MapTemplateIdSchema,
});
export type CreateSpaceBody = z.infer<typeof CreateSpaceBodySchema>;

/** Response of `POST /api/spaces`, `GET|PATCH /api/spaces/:spaceId`. Non-members get 404. */
export const SpaceResponseSchema = z.object({ space: SpaceDetailDtoSchema });
export type SpaceResponse = z.infer<typeof SpaceResponseSchema>;

/**
 * `PATCH /api/spaces/:spaceId` (owner only, 403 otherwise).
 * Changing `themeId` broadcasts `space:theme` (E9-S1); unknown theme → 400 `UNKNOWN_THEME`.
 */
export const UpdateSpaceBodySchema = z
  .object({
    name: SpaceNameSchema.optional(),
    allowedDomain: AllowedDomainSchema.nullable().optional(),
    themeId: ThemeIdSchema.optional(),
  })
  .refine((body) => Object.values(body).some((value) => value !== undefined), {
    message: 'at least one field is required',
  });
export type UpdateSpaceBody = z.infer<typeof UpdateSpaceBodySchema>;

export const SpaceSlugParamsSchema = z.object({ slug: SpaceSlugSchema });
export type SpaceSlugParams = z.infer<typeof SpaceSlugParamsSchema>;

/**
 * `POST /api/spaces/by-slug/:slug/enter`: used by `/s/:slug`. Members get the space; people
 * whose verified e-mail matches `allowedDomain` are added as members first (`joined: true`,
 * E2-S4). Everyone else gets 404.
 */
export const EnterSpaceResponseSchema = z.object({
  space: SpaceDetailDtoSchema,
  joined: z.boolean(),
});
export type EnterSpaceResponse = z.infer<typeof EnterSpaceResponseSchema>;
