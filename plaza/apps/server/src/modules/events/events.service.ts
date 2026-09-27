import { AreaIdSchema, type ProductEventName, type TrackEventBody } from '@plaza/shared';
import { z } from 'zod';

import { AppError } from '../../platform/errors.js';
import { KeyedTokenBuckets } from '../../platform/token-bucket.js';

/** Scalar properties of an event: ids and counters only, never personal data. */
export type ProductEventProps = Readonly<Record<string, string | number | boolean>>;

/** A product event as stored (E6-S2, E8-S7). */
export interface ProductEventRecord {
  readonly name: ProductEventName;
  readonly spaceId: string | null;
  /** userId of whoever did it: an opaque id, no name or email. */
  readonly actorId: string | null;
  readonly props?: ProductEventProps;
}

export interface EventsStore {
  insert(event: ProductEventRecord): Promise<void>;
}

/** Membership guard (the spaces service): non-members get `NOT_A_MEMBER` (404). */
export interface EventsMembership {
  assertMember(spaceId: string, userId: string): Promise<unknown>;
}

/**
 * Events the web client may report, with the only properties each one may carry. The others
 * (`room_entered`, `space_joined`…) are facts the server sees by itself and records directly.
 */
const CLIENT_EVENTS: Partial<Record<ProductEventName, z.ZodType<ProductEventProps>>> = {
  // E6-S2 "Unirse a la reunión" (metric O6: entries to a room that open its Meet).
  room_meet_opened: z.strictObject({ areaId: AreaIdSchema }),
};

/** Client events per person: a burst of 10, then one every 6 s. */
const CLIENT_BURST = 10;
const CLIENT_PER_SECOND = 1 / 6;

/**
 * Product events without personal data, aggregated for the O1–O6 metrics (E6-S2, E8-S7):
 * append-only rows with the event name, the space, the pseudonymous actor id and a few ids.
 */
export class EventsService {
  readonly #store: EventsStore;
  readonly #spaces: EventsMembership;
  readonly #buckets: KeyedTokenBuckets;

  constructor(deps: { store: EventsStore; spaces: EventsMembership; now?: () => number }) {
    this.#store = deps.store;
    this.#spaces = deps.spaces;
    this.#buckets = new KeyedTokenBuckets({
      capacity: CLIENT_BURST,
      refillPerSecond: CLIENT_PER_SECOND,
      ...(deps.now !== undefined && { now: deps.now }),
    });
  }

  /** Records something the server saw happen (e.g. `room_entered` from the world module). */
  record(event: ProductEventRecord): Promise<void> {
    return this.#store.insert(event);
  }

  /**
   * `POST /api/spaces/:spaceId/events`: an event reported by the web client. Members only
   * (404 otherwise); only the events of {@link CLIENT_EVENTS}, with exactly their properties
   * (`VALIDATION_ERROR` otherwise); at most a burst of 10 per person (`RATE_LIMITED`).
   */
  async recordFromClient(spaceId: string, userId: string, body: TrackEventBody): Promise<void> {
    await this.#spaces.assertMember(spaceId, userId);
    const schema = CLIENT_EVENTS[body.name];
    if (schema === undefined) {
      throw new AppError('VALIDATION_ERROR', `The client cannot report "${body.name}"`);
    }
    const props = schema.safeParse(body.props ?? {});
    if (!props.success) throw new AppError('VALIDATION_ERROR', 'Invalid event properties');
    if (!this.#buckets.tryTake(userId)) throw new AppError('RATE_LIMITED', 'Too many events');
    await this.#store.insert({ name: body.name, spaceId, actorId: userId, props: props.data });
  }
}
