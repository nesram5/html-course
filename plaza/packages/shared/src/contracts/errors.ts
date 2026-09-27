import { z } from 'zod';

/**
 * Error codes shared by REST responses (`{ error: { code, message } }`), the realtime `error`
 * event and socket acks. The web client translates them (i18n key `errors.<CODE>`).
 */
export const ERROR_CODES = [
  // Generic
  'UNAUTHORIZED',
  'FORBIDDEN',
  'NOT_FOUND',
  'VALIDATION_ERROR',
  'CONFLICT',
  'RATE_LIMITED',
  'INTERNAL',
  // Auth (E1)
  'OAUTH_FAILED',
  'UNKNOWN_AVATAR',
  // Spaces and access (E2)
  'UNKNOWN_MAP_TEMPLATE',
  'INVALID_INVITE',
  'DOMAIN_NOT_ALLOWED',
  'LAST_OWNER',
  'NOT_A_MEMBER',
  /** Removed by an owner: invite links and the allowed domain no longer let the person in. */
  'BANNED_FROM_SPACE',
  // Meeting rooms (E2-S7, E6)
  'UNKNOWN_ROOM',
  'INVALID_MEET_URI',
  'MEETING_PROVIDER_ERROR',
  // Realtime (E4)
  'SPACE_FULL',
  'PROTOCOL_MISMATCH',
  'SESSION_REPLACED',
  'NOT_IN_SPACE',
  // Media (E5)
  'MEDIA_PROVIDER_ERROR',
  // Presence (E7)
  'RING_COOLDOWN',
  'UNKNOWN_USER',
  // Personalization (E9)
  'UNKNOWN_THEME',
  'UNKNOWN_DESK',
  'DESK_TAKEN',
  'UNKNOWN_DECOR_ITEM',
] as const;

export const ErrorCodeSchema = z.enum(ERROR_CODES);
export type ErrorCode = z.infer<typeof ErrorCodeSchema>;

/** Default HTTP status for each code. A server `AppError` may override it. */
export const ERROR_HTTP_STATUS = {
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  VALIDATION_ERROR: 400,
  CONFLICT: 409,
  RATE_LIMITED: 429,
  INTERNAL: 500,
  OAUTH_FAILED: 401,
  UNKNOWN_AVATAR: 400,
  UNKNOWN_MAP_TEMPLATE: 400,
  INVALID_INVITE: 404,
  DOMAIN_NOT_ALLOWED: 403,
  LAST_OWNER: 409,
  // Non-members get 404 on REST so space existence is not leaked (E2-S2).
  NOT_A_MEMBER: 404,
  BANNED_FROM_SPACE: 403,
  UNKNOWN_ROOM: 404,
  INVALID_MEET_URI: 400,
  MEETING_PROVIDER_ERROR: 502,
  SPACE_FULL: 409,
  PROTOCOL_MISMATCH: 400,
  SESSION_REPLACED: 409,
  NOT_IN_SPACE: 409,
  MEDIA_PROVIDER_ERROR: 502,
  RING_COOLDOWN: 429,
  UNKNOWN_USER: 404,
  UNKNOWN_THEME: 400,
  UNKNOWN_DESK: 404,
  DESK_TAKEN: 409,
  UNKNOWN_DECOR_ITEM: 400,
} as const satisfies Record<ErrorCode, number>;

/** Payload of an error: REST body `error` field, realtime `error` event and failed acks. */
export const ErrorPayloadSchema = z.object({
  code: ErrorCodeSchema,
  message: z.string(),
});
export type ErrorPayload = z.infer<typeof ErrorPayloadSchema>;

/** Body of every non-2xx REST response. */
export const ErrorResponseSchema = z.object({
  error: ErrorPayloadSchema,
});
export type ErrorResponse = z.infer<typeof ErrorResponseSchema>;

export function isErrorCode(value: unknown): value is ErrorCode {
  return ErrorCodeSchema.safeParse(value).success;
}
