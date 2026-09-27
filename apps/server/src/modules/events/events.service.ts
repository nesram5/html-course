import { createHmac } from 'node:crypto';

import {
  AreaIdSchema,
  SERVER_ONLY_PRODUCT_EVENTS,
  type ProductEventName,
  type TelemetryBody,
  type TelemetrySample,
  type TrackEventBody,
} from '@plaza/shared';
import type { Prisma } from '@prisma/client';
import { z } from 'zod';

import type { ErrorReporter } from '../../platform/error-reporter.js';
import { AppError } from '../../platform/errors.js';
import type { Logger } from '../../platform/logger.js';
import { KeyedTokenBuckets } from '../../platform/token-bucket.js';
import type { SpacesService } from '../spaces/index.js';
import type { EventsRepository, ProductEventRow } from './events.repository.js';

/** Extra data of an event: numbers, flags and short identifiers only, never personal data. */
export type EventProps = Readonly<Record<string, string | number | boolean>>;

export interface RecordEventInput {
  readonly spaceId: string | null;
  /** The person the event is about; stored only as a pseudonymous {@link actorIdOf} id. */
  readonly userId: string | null;
  readonly props?: EventProps;
}

export interface EventsServiceDeps {
  repository: EventsRepository;
  spaces: SpacesService;
  logger: Logger;
  reporter: ErrorReporter;
  /** `SESSION_SECRET`: key of the pseudonymous actor ids. */
  secret: string;
  now: () => Date;
}

/**
 * Pseudonymous id of a person in product events: an HMAC of the user id, so the metrics can
 * count distinct people without the events holding anything that identifies them. Once the
 * account is deleted nothing links it back to anyone.
 */
export function actorIdOf(secret: string, userId: string): string {
  return createHmac('sha256', secret).update(`product-actor:${userId}`).digest('base64url');
}

/**
 * Events the web client may report, with exactly the properties each one may carry. The rest
 * (`room_entered`, `space_joined`…) are facts the server sees by itself and records directly.
 */
const CLIENT_EVENTS: Partial<Record<ProductEventName, z.ZodType<EventProps>>> = {
  // E6-S2 "Unirse a la reunión" (metric O6: entries to a room that open its Meet).
  room_meet_opened: z.strictObject({ areaId: AreaIdSchema }),
};

/** Client events per person: a burst of 10, then one every 6 s. */
const CLIENT_EVENTS_BURST = 10;
const CLIENT_EVENTS_PER_SECOND = 1 / 6;

function sampleProps(sample: TelemetrySample): Prisma.InputJsonObject {
  switch (sample.metric) {
    case 'av_first_frame':
    case 'join_time':
      return { valueMs: sample.valueMs };
    case 'session_started':
      return { sessionKey: sample.sessionKey };
    case 'session_error':
      return { sessionKey: sample.sessionKey, kind: sample.kind };
  }
}

/**
 * Product events and client telemetry (E6-S2, E8-S7), stored in `ProductEvent` without personal
 * data and aggregated by the admin metrics (O1–O6).
 *
 * `record()` is what other modules call (`services.get('events')`): it never blocks nor fails
 * the use case that triggers it; a failed write is only logged and reported.
 */
export class EventsService {
  readonly #pending = new Set<Promise<void>>();
  readonly #clientBuckets: KeyedTokenBuckets;

  constructor(private readonly deps: EventsServiceDeps) {
    this.#clientBuckets = new KeyedTokenBuckets({
      capacity: CLIENT_EVENTS_BURST,
      refillPerSecond: CLIENT_EVENTS_PER_SECOND,
      now: () => deps.now().getTime(),
    });
  }

  /** Records a server-side product event in the background. */
  record(name: ProductEventName, input: RecordEventInput): void {
    const write = this.deps.repository
      .insert([this.#row(name, input)])
      .catch((error: unknown) => {
        this.deps.logger.warn({ err: error, event: name }, 'Product event not recorded');
        this.deps.reporter.captureException(error, { event: name });
      })
      .finally(() => this.#pending.delete(write));
    this.#pending.add(write);
  }

  /** Resolves once every event recorded so far is written (tests, shutdown). */
  async flush(): Promise<void> {
    while (this.#pending.size > 0) await Promise.all(this.#pending);
  }

  /**
   * `POST /api/spaces/:spaceId/events`: an event the client sees first (e.g. "Unirse a la
   * reunión" opened Meet). Events the server computes are refused, and the others must carry
   * exactly their properties (`VALIDATION_ERROR`); members only (`NOT_A_MEMBER`); at most a burst
   * of 10 per person (`RATE_LIMITED`).
   */
  async trackClientEvent(spaceId: string, userId: string, body: TrackEventBody): Promise<void> {
    const schema = CLIENT_EVENTS[body.name];
    if (SERVER_ONLY_PRODUCT_EVENTS.includes(body.name) || schema === undefined) {
      throw new AppError('VALIDATION_ERROR', `"${body.name}" is recorded by the server`);
    }
    const props = schema.safeParse(body.props ?? {});
    if (!props.success) throw new AppError('VALIDATION_ERROR', 'Invalid event properties');
    await this.deps.spaces.assertMember(spaceId, userId);
    if (!this.#clientBuckets.tryTake(userId)) {
      throw new AppError('RATE_LIMITED', 'Too many events');
    }
    await this.deps.repository.insert([
      this.#row(body.name, { spaceId, userId, props: props.data }),
    ]);
  }

  /**
   * `POST /api/telemetry`: client measurements. Samples about spaces the person is not a member
   * of are dropped. Returns how many were stored.
   */
  async recordTelemetry(userId: string, body: TelemetryBody): Promise<number> {
    const spaceIds = [...new Set(body.samples.map((sample) => sample.spaceId))];
    const allowed = await this.deps.repository.memberSpaceIds(userId, spaceIds);
    const rows = body.samples
      .filter((sample) => allowed.has(sample.spaceId))
      .map((sample) => ({
        ...this.#row(sample.metric, { spaceId: sample.spaceId, userId }),
        props: sampleProps(sample),
      }));
    await this.deps.repository.insert(rows);
    return rows.length;
  }

  #row(name: string, input: RecordEventInput): ProductEventRow {
    return {
      name,
      spaceId: input.spaceId,
      actorId: input.userId === null ? null : actorIdOf(this.deps.secret, input.userId),
      ...(input.props !== undefined && { props: { ...input.props } }),
      createdAt: this.deps.now(),
    };
  }
}
