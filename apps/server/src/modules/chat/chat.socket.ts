import { CHAT_RATE_PER_SEC, REACTION_RATE_PER_SEC } from '@plaza/shared';

import { AppError } from '../../platform/errors.js';
import { safeHandler, type PlazaIo, type SafeHandlerDeps } from '../../platform/socket.js';
import { KeyedTokenBuckets } from '../../platform/token-bucket.js';
import { socketUserId } from '../auth/index.js';
import type { ChatService } from './chat.service.js';

/**
 * Socket.IO adapter of the chat module: `chat:send` (at most 5 per second) and `reaction` (at
 * most 3 per second) per person (architecture §11.1). The buckets are keyed by person, not by
 * socket, so opening a new connection (another tab, a reconnection) does not refill them. Going
 * over the limit answers `RATE_LIMITED`.
 */
export function registerChatSocket(
  io: PlazaIo,
  deps: SafeHandlerDeps,
  chat: ChatService,
  clock: () => number,
): void {
  const messages = new KeyedTokenBuckets({
    capacity: CHAT_RATE_PER_SEC,
    refillPerSecond: CHAT_RATE_PER_SEC,
    now: clock,
  });
  const reactions = new KeyedTokenBuckets({
    capacity: REACTION_RATE_PER_SEC,
    refillPerSecond: REACTION_RATE_PER_SEC,
    now: clock,
  });

  io.on('connection', (socket) => {
    socket.on(
      'chat:send',
      safeHandler(deps, socket, 'chat:send', (payload) => {
        if (!messages.tryTake(socketUserId(socket))) {
          throw new AppError('RATE_LIMITED', `At most ${String(CHAT_RATE_PER_SEC)} messages/s`);
        }
        return chat.send(socket, payload.body);
      }),
    );
    socket.on(
      'reaction',
      safeHandler(deps, socket, 'reaction', (payload) => {
        if (!reactions.tryTake(socketUserId(socket))) {
          throw new AppError(
            'RATE_LIMITED',
            `At most ${String(REACTION_RATE_PER_SEC)} reactions/s`,
          );
        }
        chat.react(socket, payload.emoji);
        return undefined;
      }),
    );
  });
}
