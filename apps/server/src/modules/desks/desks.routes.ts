import {
  API_PATHS,
  ClaimDeskBodySchema,
  DecorCatalogResponseSchema,
  DeskParamsSchema,
  DeskResponseSchema,
  DesksResponseSchema,
  SpaceParamsSchema,
  type DecorCatalogResponse,
  type DeskResponse,
  type DesksResponse,
} from '@bululu/shared';
import type { FastifyInstance, preHandlerAsyncHookHandler } from 'fastify';
import { z } from 'zod';

import { currentUser } from '../auth/index.js';
import type { DesksService } from './desks.service.js';

interface DesksRoutesDeps {
  desks: DesksService;
  requireUser: preHandlerAsyncHookHandler;
}

/**
 * Body of `PATCH …/decor` as received: the catalog and the 3-slot limit are checked by the
 * service with `validateDeskDecor`, so it can answer `UNKNOWN_DECOR_ITEM` or `VALIDATION_ERROR`.
 */
const DecorRequestSchema = z.object({
  slots: z.array(z.string().min(1).max(64).nullable()).max(32),
});

export function registerDesksRoutes(app: FastifyInstance, deps: DesksRoutesDeps): void {
  const { desks } = deps;
  const auth = { preHandler: deps.requireUser };

  app.get(API_PATHS.decorCatalog, auth, (): DecorCatalogResponse => {
    return DecorCatalogResponseSchema.parse({ items: desks.catalog() });
  });

  app.get(API_PATHS.desks, auth, async (request): Promise<DesksResponse> => {
    const { spaceId } = SpaceParamsSchema.parse(request.params);
    return DesksResponseSchema.parse({
      desks: await desks.list(spaceId, currentUser(request).userId),
    });
  });

  app.put(API_PATHS.desk, auth, async (request): Promise<DeskResponse> => {
    const { spaceId, deskId } = DeskParamsSchema.parse(request.params);
    const body = ClaimDeskBodySchema.parse(request.body ?? {});
    const desk = await desks.claim(spaceId, currentUser(request).userId, deskId, body.userId);
    return DeskResponseSchema.parse({ desk });
  });

  app.delete(API_PATHS.desk, auth, async (request, reply) => {
    const { spaceId, deskId } = DeskParamsSchema.parse(request.params);
    await desks.release(spaceId, currentUser(request).userId, deskId);
    return reply.code(204).send();
  });

  app.patch(API_PATHS.deskDecor, auth, async (request): Promise<DeskResponse> => {
    const { spaceId, deskId } = DeskParamsSchema.parse(request.params);
    const body = DecorRequestSchema.parse(request.body);
    const desk = await desks.decorate(spaceId, currentUser(request).userId, deskId, body);
    return DeskResponseSchema.parse({ desk });
  });
}
