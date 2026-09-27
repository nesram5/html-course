import { z } from 'zod';

import { DESK_DECOR_SLOTS } from '../../constants.js';

/**
 * Characters a name may not contain: C0/C1 controls (PostgreSQL rejects NUL outright, which
 * would surface as an unexpected 500) and bidi overrides, which can disguise a name.
 */
// eslint-disable-next-line no-control-regex -- matching control characters is the point
const NAME_FORBIDDEN = /[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/u;
/** Characters a free text (chat, feedback) may not contain: controls except tab and new lines. */
// eslint-disable-next-line no-control-regex -- matching control characters is the point
const TEXT_FORBIDDEN = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u;

/** A trimmed one-line name of `1..max` characters without control characters (400 otherwise). */
export function nameSchema(max: number) {
  return z
    .string()
    .trim()
    .min(1)
    .max(max)
    .refine((value) => !NAME_FORBIDDEN.test(value), 'control characters are not allowed');
}

/** A trimmed free text of `1..max` characters; tabs and new lines are fine, other controls not. */
export function textSchema(max: number) {
  return z
    .string()
    .trim()
    .min(1)
    .max(max)
    .refine((value) => !TEXT_FORBIDDEN.test(value), 'control characters are not allowed');
}

/** Removes what {@link nameSchema} refuses (names that come from Google, E1-S2). */
export function stripNameControls(value: string): string {
  return value.replace(new RegExp(NAME_FORBIDDEN.source, 'gu'), '');
}

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

// eslint-disable-next-line no-control-regex -- control characters are exactly what is refused
const URL_UNSAFE_CHARS = /[\s\u0000-\u001f\u007f\\]/;

/**
 * Relative in-app path used as post-login redirect. Rejects open redirects (`//evil.com`,
 * `/\\evil.com`) and whitespace, control characters and backslashes anywhere: browsers drop tabs
 * and newlines from URLs (`/\t/evil.com` becomes `//evil.com`) and a newline would break the
 * `Location` header. Paths built from `location` are percent-encoded, so they never contain them.
 */
export const SafeNextPathSchema = z
  .string()
  .max(512)
  .regex(/^\/(?![/\\])/, 'must be a relative path starting with a single "/"')
  .refine((path) => !URL_UNSAFE_CHARS.test(path), {
    message: 'must not contain whitespace, control characters or "\\"',
  });

export const SpaceParamsSchema = z.object({ spaceId: IdSchema });
export type SpaceParams = z.infer<typeof SpaceParamsSchema>;

/** Response with no meaningful body (the route answers 204). */
export const NoContentSchema = z.undefined();
