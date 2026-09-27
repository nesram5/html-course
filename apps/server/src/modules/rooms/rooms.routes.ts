import {
  API_PATHS,
  apiPath,
  AuthorizeRoomsResponseSchema,
  IdSchema,
  OAuthCallbackQuerySchema,
  RoomParamsSchema,
  RoomResponseSchema,
  RoomsResponseSchema,
  SpaceParamsSchema,
  UpdateRoomBodySchema,
  WEB_PATHS,
  type AuthorizeRoomsResponse,
  type RoomResponse,
  type RoomsResponse,
  type RoomsSetupResult,
} from '@bululu/shared';
import type { FastifyInstance, preHandlerAsyncHookHandler } from 'fastify';
import { z } from 'zod';

import type { MeetingProvider } from '../../adapters/meeting-provider.js';
import type { AppConfig } from '../../platform/config.js';
import { AppError } from '../../platform/errors.js';
import type { Logger } from '../../platform/logger.js';
import { currentUser, OAuthFlowCookie } from '../auth/index.js';
import type { RoomsService } from './rooms.service.js';

export const MEET_FLOW_COOKIE = 'bululu_oauth_meet';

const meetFlow = new OAuthFlowCookie(
  MEET_FLOW_COOKIE,
  z.object({ spaceId: IdSchema, userId: IdSchema }),
);

interface RoomsRoutesDeps {
  rooms: RoomsService;
  meetings: MeetingProvider;
  requireUser: preHandlerAsyncHookHandler;
  config: AppConfig;
  logger: Logger;
}

export function registerRoomsRoutes(app: FastifyInstance, deps: RoomsRoutesDeps): void {
  const { rooms, meetings, config, logger } = deps;
  const auth = { preHandler: deps.requireUser };
  const redirectUri = `${config.publicUrl}${API_PATHS.roomsAuthCallback}`;

  const settingsUrl = (spaceId: string, result: RoomsSetupResult): string =>
    `${config.publicUrl}${apiPath(WEB_PATHS.spaceSettings, { spaceId })}?rooms=${result}`;

  app.get(API_PATHS.rooms, auth, async (request): Promise<RoomsResponse> => {
    const { spaceId } = SpaceParamsSchema.parse(request.params);
    return RoomsResponseSchema.parse({
      rooms: await rooms.list(spaceId, currentUser(request).userId),
    });
  });

  // Incremental authorization: asks the owner only for `meetings.space.created`.
  app.post(
    API_PATHS.roomsAuthorize,
    auth,
    async (request, reply): Promise<AuthorizeRoomsResponse> => {
      const { spaceId } = SpaceParamsSchema.parse(request.params);
      const { userId } = currentUser(request);
      await rooms.assertCanAuthorize(spaceId, userId);
      const { state, codeChallenge } = meetFlow.begin(reply, { spaceId, userId });
      const authorizeUrl = meetings.createAuthorizationUrl({ state, codeChallenge, redirectUri });
      return AuthorizeRoomsResponseSchema.parse({ authorizeUrl });
    },
  );

  // Google comes back here: create the missing Meet spaces and go back to the space settings.
  app.get(API_PATHS.roomsAuthCallback, auth, async (request, reply) => {
    const query = OAuthCallbackQuerySchema.parse(request.query);
    const flow = meetFlow.take(request, reply);
    const { userId } = currentUser(request);

    if (query.error !== undefined) {
      logger.info({ oauthError: query.error }, 'Meet authorization not granted');
      if (flow === null) return reply.redirect(`${config.publicUrl}${WEB_PATHS.spaces}`);
      return reply.redirect(settingsUrl(flow.spaceId, 'denied'));
    }

    let verified;
    try {
      verified = OAuthFlowCookie.verify(flow, query.state);
      if (verified.userId !== userId) throw new AppError('OAUTH_FAILED', 'Flow of another user');
      if (query.code === undefined) throw new AppError('OAUTH_FAILED', 'Missing code');
    } catch (error) {
      logger.warn(
        { reason: error instanceof Error ? error.message : 'unknown' },
        'Meet callback rejected',
      );
      throw error;
    }

    let result: RoomsSetupResult = 'created';
    try {
      await rooms.createAll(verified.spaceId, userId, {
        code: query.code,
        codeVerifier: verified.verifier,
        redirectUri,
      });
    } catch (error) {
      if (!(error instanceof AppError && error.code === 'MEETING_PROVIDER_ERROR')) throw error;
      logger.warn({ spaceId: verified.spaceId, message: error.message }, 'Meet rooms not created');
      result = 'failed';
    }
    return reply.redirect(settingsUrl(verified.spaceId, result));
  });

  app.put(API_PATHS.room, auth, async (request): Promise<RoomResponse> => {
    const { spaceId, areaId } = RoomParamsSchema.parse(request.params);
    const body = UpdateRoomBodySchema.safeParse(request.body);
    if (!body.success) {
      throw new AppError('INVALID_MEET_URI', 'The link must start with https://meet.google.com/');
    }
    const room = await rooms.replace(
      spaceId,
      currentUser(request).userId,
      areaId,
      body.data.meetUri,
    );
    return RoomResponseSchema.parse({ room });
  });
}
