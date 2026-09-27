import { z } from 'zod';

import { MEET_URI_PREFIX } from '../../constants.js';
import { AreaIdSchema, IdSchema } from './common.js';

/** A Google Meet link: must start with `https://meet.google.com/` (E2-S7). */
export const MeetUriSchema = z.url().refine((value) => value.startsWith(MEET_URI_PREFIX), {
  message: `must start with ${MEET_URI_PREFIX}`,
});

export const MeetingRoomSourceSchema = z.enum(['api', 'manual']);
export type MeetingRoomSource = z.infer<typeof MeetingRoomSourceSchema>;

/** A meeting room of the map (`rooms` layer) with its Meet link, if any. */
export const MeetingRoomDtoSchema = z.object({
  areaId: AreaIdSchema,
  name: z.string(),
  meetUri: MeetUriSchema.nullable(),
  source: MeetingRoomSourceSchema.nullable(),
});
export type MeetingRoomDto = z.infer<typeof MeetingRoomDtoSchema>;

export const RoomParamsSchema = z.object({ spaceId: IdSchema, areaId: AreaIdSchema });
export type RoomParams = z.infer<typeof RoomParamsSchema>;

/** `GET /api/spaces/:spaceId/rooms` (members). */
export const RoomsResponseSchema = z.object({ rooms: z.array(MeetingRoomDtoSchema) });
export type RoomsResponse = z.infer<typeof RoomsResponseSchema>;

/**
 * `POST /api/spaces/:spaceId/rooms/authorize` (owner): starts the incremental Google
 * authorization (`meetings.space.created`). The web app navigates to `authorizeUrl`; Google
 * returns to `/api/auth/google/meet/callback`, which creates the missing Meet spaces
 * (idempotent) and redirects to the space settings.
 */
export const AuthorizeRoomsResponseSchema = z.object({ authorizeUrl: z.url() });
export type AuthorizeRoomsResponse = z.infer<typeof AuthorizeRoomsResponseSchema>;

/** Query appended to the settings page after the Meet callback. */
export const RoomsSetupResultSchema = z.enum(['created', 'denied', 'failed']);
export type RoomsSetupResult = z.infer<typeof RoomsSetupResultSchema>;

/** `PUT /api/spaces/:spaceId/rooms/:areaId` (owner): replace the link by hand. */
export const UpdateRoomBodySchema = z.object({ meetUri: MeetUriSchema });
export type UpdateRoomBody = z.infer<typeof UpdateRoomBodySchema>;

export const RoomResponseSchema = z.object({ room: MeetingRoomDtoSchema });
export type RoomResponse = z.infer<typeof RoomResponseSchema>;
