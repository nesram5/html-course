import {
  API_PATHS,
  SpaceParamsSchema,
  TELEMETRY_RATE_PER_MINUTE,
  TelemetryBodySchema,
  TrackEventBodySchema,
} from '@plaza/shared';
import type { FastifyInstance, preHandlerAsyncHookHandler } from 'fastify';

import { currentUser, sessionRateLimitKey } from '../auth/index.js';
import type { EventsService } from './events.service.js';

export function registerEventsRoutes(
  app: FastifyInstance,
  deps: { events: EventsService; requireUser: preHandlerAsyncHookHandler },
): void {
  // E6-S2 / E8-S7: product events the client sees first (members only, 404 otherwise).
  app.post(API_PATHS.events, { preHandler: deps.requireUser }, async (request, reply) => {
    const { spaceId } = SpaceParamsSchema.parse(request.params);
    const body = TrackEventBodySchema.parse(request.body);
    await deps.events.trackClientEvent(spaceId, currentUser(request).userId, body);
    return reply.code(204).send();
  });

  // E8-S7: client measurements for O3, O4 and O5 (rate-limited per session).
  app.post(
    API_PATHS.telemetry,
    {
      preHandler: deps.requireUser,
      config: {
        rateLimit: {
          max: TELEMETRY_RATE_PER_MINUTE,
          timeWindow: '1 minute',
          keyGenerator: sessionRateLimitKey,
        },
      },
    },
    async (request, reply) => {
      const body = TelemetryBodySchema.parse(request.body);
      await deps.events.recordTelemetry(currentUser(request).userId, body);
      return reply.code(204).send();
    },
  );
}
