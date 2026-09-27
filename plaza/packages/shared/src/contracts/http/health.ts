import { z } from 'zod';

/**
 * Header that unlocks the detailed `GET /api/health` (E8-S1): its value must equal the server's
 * `HEALTH_TOKEN`. Without it the endpoint answers liveness only (`status` and `version`).
 */
export const HEALTH_TOKEN_HEADER = 'x-health-token';

/** Realtime figures of the detailed health (architecture §11.3, E8-S1). */
export const RealtimeHealthSchema = z.object({
  /** Connected people per space id. */
  connectedBySpace: z.record(z.string(), z.number().int().nonnegative()),
  /** People in a hallway conversation (at least one media peer) per space id. */
  inConversationBySpace: z.record(z.string(), z.number().int().nonnegative()),
  /** Average duration of the last server ticks, `null` while no space is running. */
  avgTickMs: z.number().nonnegative().nullable(),
  /** Average `media:peers` messages sent per working tick (E5-S2), `null` before the first. */
  avgMediaPeersPerTick: z.number().nonnegative().nullable(),
});
export type RealtimeHealth = z.infer<typeof RealtimeHealthSchema>;

/** Process figures of the detailed health (memory leaks in the load test, E8-S3). */
export const ProcessHealthSchema = z.object({
  uptimeSeconds: z.number().nonnegative(),
  rssMb: z.number().nonnegative(),
  heapUsedMb: z.number().nonnegative(),
});
export type ProcessHealth = z.infer<typeof ProcessHealthSchema>;

/**
 * `GET /api/health` (E0-S3, extended by E8-S1). Public liveness: `status` and `version`.
 * With the `X-Health-Token` header (or outside production when no token is configured) it
 * also carries the realtime and process figures.
 */
export const HealthResponseSchema = z.object({
  status: z.literal('ok'),
  version: z.string(),
  realtime: RealtimeHealthSchema.optional(),
  process: ProcessHealthSchema.optional(),
});
export type HealthResponse = z.infer<typeof HealthResponseSchema>;
