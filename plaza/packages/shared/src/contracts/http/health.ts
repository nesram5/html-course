import { z } from 'zod';

/** `GET /api/health` (E0-S3, extended by E8-S1 with realtime figures). */
export const HealthResponseSchema = z.object({
  status: z.literal('ok'),
  version: z.string(),
  realtime: z.object({
    /** Connected people per space id. */
    connectedBySpace: z.record(z.string(), z.number().int().nonnegative()),
    /** Average duration of the last server ticks, `null` while no space is running. */
    avgTickMs: z.number().nonnegative().nullable(),
    /** Average `media:peers` messages sent per working tick (E5-S2), `null` before the first. */
    avgMediaPeersPerTick: z.number().nonnegative().nullable(),
  }),
});
export type HealthResponse = z.infer<typeof HealthResponseSchema>;
