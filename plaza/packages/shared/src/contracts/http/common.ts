import { z } from 'zod';

import { DESK_DECOR_SLOTS } from '../../constants.js';

/** Database identifiers are cuids, but we only require a sane non-empty token. */
export const IdSchema = z.string().min(1).max(64);

/** Map template id with version, e.g. `office-small@1` (ADR-006). */
export const MapTemplateIdSchema = z
  .string()
  .regex(/^[a-z0-9-]+@\d+$/, 'expected "<template>@<version>"');

/** Identifiers coming from Tiled maps and catalogs (`areaId`, `deskId`, avatar/decor/theme ids). */
export const SlugIdSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[a-z0-9][a-z0-9_-]*$/, 'expected lowercase letters, digits, "-" or "_"');

export const AreaIdSchema = SlugIdSchema;
export const DeskIdSchema = SlugIdSchema;
export const AvatarIdSchema = SlugIdSchema;
export const ThemeIdSchema = SlugIdSchema;
export const DecorItemIdSchema = SlugIdSchema;

/** ISO-8601 timestamp as sent over JSON. */
export const IsoDateTimeSchema = z.iso.datetime({ offset: true });

export const RoleSchema = z.enum(['OWNER', 'MEMBER']);
export type Role = z.infer<typeof RoleSchema>;

/** Status chosen by the person (RF-11). "Away" is a separate automatic flag. */
export const PresenceStatusSchema = z.enum(['available', 'busy']);
export type PresenceStatus = z.infer<typeof PresenceStatusSchema>;

/** Decoration of a desk: exactly 3 slots, each an item of the decor catalog or empty (RN-15). */
export const DeskDecorSchema = z.object({
  slots: z.array(DecorItemIdSchema.nullable()).length(DESK_DECOR_SLOTS),
});
export type DeskDecor = z.infer<typeof DeskDecorSchema>;

export const EMPTY_DESK_DECOR: DeskDecor = { slots: [null, null, null] };

/** Relative in-app path used as post-login redirect. Rejects open redirects (`//evil.com`). */
export const SafeNextPathSchema = z
  .string()
  .max(512)
  .regex(/^\/(?![/\\])/, 'must be a relative path starting with a single "/"');

export const SpaceParamsSchema = z.object({ spaceId: IdSchema });
export type SpaceParams = z.infer<typeof SpaceParamsSchema>;

/** Response with no meaningful body (the route answers 204). */
export const NoContentSchema = z.undefined();
