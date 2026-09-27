import {
  API_PATHS,
  MediaTokenResponseSchema,
  SpaceParamsSchema,
  type MediaTokenResponse,
} from '@plaza/shared';
import type { FastifyInstance, FastifyRequest, preHandlerAsyncHookHandler } from 'fastify';
import type { WebhookReceiver } from 'livekit-server-sdk';

import { AppError } from '../../platform/errors.js';
import type { MediaService } from './media.service.js';

/** Largest webhook body accepted (LiveKit's are a few KiB). */
const WEBHOOK_BODY_LIMIT = 64 * 1024;
/** Webhooks per minute from one IP (the media server): a busy space sends several per person. */
const WEBHOOKS_PER_MINUTE = 3000;

/**
 * Authentication seam of the media routes. The auth module provides both pieces
 * (`services.get('auth').requireUser` and `currentUser(request).userId`); tests use a stub.
 */
export interface MediaAuth {
  /** Fastify `preHandler` that rejects requests without a valid session (401 `UNAUTHORIZED`). */
  requireUser: preHandlerAsyncHookHandler;
  /** userId of the person authenticated by `requireUser`. */
  currentUserId(request: FastifyRequest): string;
}

export function registerMediaRoutes(
  app: FastifyInstance,
  deps: { media: MediaService; auth: MediaAuth },
): void {
  const { media, auth } = deps;

  // E5-S3: LiveKit credentials for the space (members only, 404 otherwise).
  app.post(
    API_PATHS.mediaToken,
    { preHandler: auth.requireUser },
    async (request): Promise<MediaTokenResponse> => {
      const { spaceId } = SpaceParamsSchema.parse(request.params);
      const response = await media.issueToken(spaceId, auth.currentUserId(request));
      return MediaTokenResponseSchema.parse(response);
    },
  );
}

/**
 * E6-S3: webhook of the media server (`POST /api/media/livekit-webhook`). No session: LiveKit
 * signs each call with the API secret (a JWT in `Authorization` holding the SHA-256 of the raw
 * body), and anything unsigned or altered gets 401. On `participant_joined` and
 * `track_published` the person is isolated again if they stand in a meeting room. It can only
 * ever restrict publishing, so a replayed call does no harm.
 */
export async function registerMediaWebhook(
  app: FastifyInstance,
  deps: { media: MediaService; receiver: Pick<WebhookReceiver, 'receive'> },
): Promise<void> {
  const { media, receiver } = deps;
  await app.register((scope, _options, done) => {
    // The signature covers the exact bytes sent: keep the body as text (this scope only).
    scope.removeAllContentTypeParsers();
    scope.addContentTypeParser(
      '*',
      { parseAs: 'string', bodyLimit: WEBHOOK_BODY_LIMIT },
      (_request, body, parsed) => {
        parsed(null, body);
      },
    );
    scope.post(
      API_PATHS.mediaWebhook,
      { config: { rateLimit: { max: WEBHOOKS_PER_MINUTE, timeWindow: '1 minute' } } },
      async (request, reply) => {
        const body = typeof request.body === 'string' ? request.body : '';
        let event;
        try {
          event = await receiver.receive(body, request.headers.authorization);
        } catch {
          throw new AppError('UNAUTHORIZED', 'Invalid media server webhook');
        }
        const identity = event.participant?.identity;
        const roomName = event.room?.name;
        if (
          (event.event === 'participant_joined' || event.event === 'track_published') &&
          identity !== undefined &&
          roomName !== undefined
        ) {
          media.participantActive(roomName, identity);
        }
        return reply.code(204).send();
      },
    );
    done();
  });
}
