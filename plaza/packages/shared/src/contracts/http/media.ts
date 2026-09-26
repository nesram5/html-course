import { z } from 'zod';

/**
 * `POST /api/spaces/:spaceId/media-token` (members; 404 otherwise). LiveKit token for the room
 * `space_<spaceId>` with identity = userId, valid 1 h, no admin grants (E5-S3).
 */
export const MediaTokenResponseSchema = z.object({
  url: z.string().regex(/^wss?:\/\//, 'expected a ws:// or wss:// URL'),
  token: z.string().min(1),
});
export type MediaTokenResponse = z.infer<typeof MediaTokenResponseSchema>;
