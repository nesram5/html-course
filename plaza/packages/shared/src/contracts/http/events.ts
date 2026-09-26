import { z } from 'zod';

/** Product events without personal data, aggregated for the O1–O6 metrics (E6-S2, E8-S7). */
export const ProductEventNameSchema = z.enum([
  'space_joined',
  'conversation_started',
  'conversation_ended',
  'room_entered',
  'room_meet_opened',
]);
export type ProductEventName = z.infer<typeof ProductEventNameSchema>;

/** `POST /api/spaces/:spaceId/events` (members) → 204. Used for client-side events. */
export const TrackEventBodySchema = z.object({
  name: ProductEventNameSchema,
  props: z
    .record(z.string().max(40), z.union([z.string().max(200), z.number(), z.boolean()]))
    .optional(),
});
export type TrackEventBody = z.infer<typeof TrackEventBodySchema>;
