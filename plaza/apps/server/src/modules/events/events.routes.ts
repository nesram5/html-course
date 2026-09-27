import { API_PATHS, SpaceParamsSchema, TrackEventBodySchema } from '@plaza/shared';
import type { FastifyInstance, preHandlerAsyncHookHandler } from 'fastify';

import { currentUser } from '../auth/index.js';
import type { EventsService } from './events.service.js';

export function registerEventsRoutes(
  app: FastifyInstance,
  deps: { events: EventsService; requireUser: preHandlerAsyncHookHandler },
): void {
  // E6-S2 / E8-S7: a product event seen by the web client (members only, 404 otherwise).
  app.post(API_PATHS.events, { preHandler: deps.requireUser }, async (request, reply) => {
    const { spaceId } = SpaceParamsSchema.parse(request.params);
    const body = TrackEventBodySchema.parse(request.body);
    await deps.events.recordFromClient(spaceId, currentUser(request).userId, body);
    return reply.code(204).send();
  });
}
