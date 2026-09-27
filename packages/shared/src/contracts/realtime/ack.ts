import { z } from 'zod';

import { ErrorPayloadSchema, type ErrorPayload } from '../errors.js';

/** Reply of an acknowledged event (`socket.emit(event, payload, ack)`). */
export type Ack<T> = { ok: true; data: T } | { ok: false; error: ErrorPayload };

/** Builds the zod schema of `Ack<T>` to validate acks on the client. */
export function ackSchema<T extends z.ZodType>(data: T) {
  return z.discriminatedUnion('ok', [
    z.object({ ok: z.literal(true), data }),
    z.object({ ok: z.literal(false), error: ErrorPayloadSchema }),
  ]);
}
