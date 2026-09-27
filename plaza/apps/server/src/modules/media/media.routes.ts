import {
  API_PATHS,
  MediaTokenResponseSchema,
  SpaceParamsSchema,
  type MediaTokenResponse,
} from '@plaza/shared';
import type { FastifyInstance, FastifyRequest, preHandlerAsyncHookHandler } from 'fastify';

import type { MediaService } from './media.service.js';

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
