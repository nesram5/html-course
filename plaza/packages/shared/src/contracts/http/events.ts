import { z } from 'zod';

import { TELEMETRY_MAX_SAMPLES, TELEMETRY_MAX_VALUE_MS } from '../../constants.js';
import { IdSchema, IsoDateTimeSchema } from './common.js';

/** Product events without personal data, aggregated for the O1–O6 metrics (E6-S2, E8-S7). */
export const ProductEventNameSchema = z.enum([
  'space_joined',
  'conversation_started',
  'conversation_ended',
  'room_entered',
  'room_meet_opened',
]);
export type ProductEventName = z.infer<typeof ProductEventNameSchema>;

/**
 * Events only the server records, from what it computes itself (entering the map, hallway
 * conversations, meeting rooms): `POST /api/spaces/:spaceId/events` refuses them, so a client
 * cannot inflate the O1, O2 or O6 figures.
 */
export const SERVER_ONLY_PRODUCT_EVENTS: readonly ProductEventName[] = [
  'space_joined',
  'conversation_started',
  'conversation_ended',
  'room_entered',
];

/** `POST /api/spaces/:spaceId/events` (members) → 204. Used for client-side events. */
export const TrackEventBodySchema = z.object({
  name: ProductEventNameSchema,
  props: z
    .record(z.string().max(40), z.union([z.string().max(200), z.number(), z.boolean()]))
    .optional(),
});
export type TrackEventBody = z.infer<typeof TrackEventBodySchema>;

// ── Client telemetry (E8-S7: O3, O4, O5) ──────────────────────────────────

/** A random id of one visit of the office, chosen by the client (not linked to the person). */
export const TelemetrySessionKeySchema = z.string().regex(/^[A-Za-z0-9_-]{8,64}$/);

const DurationMsSchema = z.number().int().min(0).max(TELEMETRY_MAX_VALUE_MS);

/**
 * One client measurement:
 * - `av_first_frame`: from `media:peers` to the first video frame of a new peer (O3, RNF-02);
 * - `join_time`: from opening the invitation link to being inside the map (O5);
 * - `session_started` / `session_error`: a visit of the office, and a critical error in it
 *   (connection or hallway media lost and not recovered within 30 s, RNF-04) (O4).
 */
export const TelemetrySampleSchema = z.discriminatedUnion('metric', [
  z.object({ metric: z.literal('av_first_frame'), spaceId: IdSchema, valueMs: DurationMsSchema }),
  z.object({ metric: z.literal('join_time'), spaceId: IdSchema, valueMs: DurationMsSchema }),
  z.object({
    metric: z.literal('session_started'),
    spaceId: IdSchema,
    sessionKey: TelemetrySessionKeySchema,
  }),
  z.object({
    metric: z.literal('session_error'),
    spaceId: IdSchema,
    sessionKey: TelemetrySessionKeySchema,
    kind: z.enum(['connection_lost', 'media_lost']),
  }),
]);
export type TelemetrySample = z.infer<typeof TelemetrySampleSchema>;
export type TelemetryMetric = TelemetrySample['metric'];

/**
 * `POST /api/telemetry` (signed in, rate-limited per session) → 204. Samples of spaces the person
 * is not a member of are dropped.
 */
export const TelemetryBodySchema = z.object({
  samples: z.array(TelemetrySampleSchema).min(1).max(TELEMETRY_MAX_SAMPLES),
});
export type TelemetryBody = z.infer<typeof TelemetryBodySchema>;

// ── Admin metrics (E8-S7) ─────────────────────────────────────────────────

/** `GET /api/admin/metrics?days=28` (people listed in `ADMIN_EMAILS` only, 404 otherwise). */
export const AdminMetricsQuerySchema = z.object({
  days: z.coerce.number().int().min(7).max(91).default(28),
});
export type AdminMetricsQuery = z.infer<typeof AdminMetricsQuerySchema>;

const RateSchema = z.number().min(0).max(1).nullable();
const MsSchema = z.number().nonnegative().nullable();

export const DurationStatsSchema = z.object({
  samples: z.number().int().nonnegative(),
  p50Ms: MsSchema,
  p95Ms: MsSchema,
});
export type DurationStats = z.infer<typeof DurationStatsSchema>;

export const SpaceUsageSchema = z.object({
  spaceId: IdSchema,
  /** `null` when the space was deleted meanwhile. */
  name: z.string().nullable(),
  /** Days with at least one entry to the map, per 7-day week, oldest first. */
  daysPerWeek: z.array(z.number().int().min(0).max(7)),
  avgDaysPerWeek: z.number().nonnegative(),
  /** Every week of the period with ≥ 3 days of use (O2 target). */
  atTarget: z.boolean(),
});
export type SpaceUsage = z.infer<typeof SpaceUsageSchema>;

export const AdminFeedbackSchema = z.object({
  id: IdSchema,
  message: z.string(),
  rating: z.number().int().min(1).max(5).nullable(),
  createdAt: IsoDateTimeSchema,
  authorName: z.string(),
  authorEmail: z.string(),
  spaceName: z.string().nullable(),
});
export type AdminFeedback = z.infer<typeof AdminFeedbackSchema>;

export const AdminMetricsResponseSchema = z.object({
  from: IsoDateTimeSchema,
  to: IsoDateTimeSchema,
  days: z.number().int().positive(),
  /** O1: hallway conversations longer than 30 s per active person and day. */
  o1: z.object({
    conversations: z.number().int().nonnegative(),
    activeUserDays: z.number().int().nonnegative(),
    perActiveUserPerDay: z.number().nonnegative().nullable(),
  }),
  /** O2: days of use per week of each space (a pilot team is a space). */
  o2: z.object({
    weeks: z.number().int().positive(),
    spaces: z.array(SpaceUsageSchema),
    spacesAtTarget: z.number().int().nonnegative(),
  }),
  /** O3: time from entering proximity to the first video frame of the other person. */
  o3: DurationStatsSchema,
  /** O4: office visits without critical errors. */
  o4: z.object({
    sessions: z.number().int().nonnegative(),
    sessionsWithErrors: z.number().int().nonnegative(),
    rate: RateSchema,
  }),
  /** O5: time from opening the invitation link to being inside the map. */
  o5: DurationStatsSchema,
  /** O6: entries to a meeting room that end in "Unirse a la reunión". */
  o6: z.object({
    roomEntries: z.number().int().nonnegative(),
    meetOpened: z.number().int().nonnegative(),
    rate: RateSchema,
  }),
  /** Latest in-app feedback, newest first. */
  feedback: z.array(AdminFeedbackSchema),
});
export type AdminMetricsResponse = z.infer<typeof AdminMetricsResponseSchema>;
