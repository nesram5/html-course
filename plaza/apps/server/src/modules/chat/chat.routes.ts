import {
  API_PATHS,
  MessagesResponseSchema,
  SpaceParamsSchema,
  type MessagesResponse,
} from '@plaza/shared';
import type { FastifyInstance, preHandlerAsyncHookHandler } from 'fastify';

import { currentUser } from '../auth/index.js';
import type { ChatService } from './chat.service.js';

export function registerChatRoutes(
  app: FastifyInstance,
  deps: { chat: ChatService; requireUser: preHandlerAsyncHookHandler },
): void {
  // E7-S3: chat history of the space (members only, 404 otherwise).
  app.get(
    API_PATHS.messages,
    { preHandler: deps.requireUser },
    async (request): Promise<MessagesResponse> => {
      const { spaceId } = SpaceParamsSchema.parse(request.params);
      const messages = await deps.chat.history(spaceId, currentUser(request).userId);
      return MessagesResponseSchema.parse({ messages });
    },
  );
}
