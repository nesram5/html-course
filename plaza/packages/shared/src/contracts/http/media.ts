import { z } from 'zod';

/**
 * `POST /api/spaces/:spaceId/media-token` (members; 404 otherwise). LiveKit token for the room
 * `space_<spaceId>` with identity = userId, valid `MEDIA_TOKEN_TTL_SECONDS` (10 min), no admin
 * grants (E5-S3). The client asks for a new one before `expiresInSeconds` runs out.
 */
export const MediaTokenResponseSchema = z.object({
  url: z.string().regex(/^wss?:\/\//, 'expected a ws:// or wss:// URL'),
  token: z.string().min(1),
  /** Lifetime of `token`, counted from the response. */
  expiresInSeconds: z.number().int().positive(),
});
export type MediaTokenResponse = z.infer<typeof MediaTokenResponseSchema>;
