import { MOVE_RATE_PER_SEC, SPACE_JOIN_BURST, SPACE_JOIN_WINDOW_MS } from '@plaza/shared';

import { AppError } from '../../platform/errors.js';
import { safeHandler, type PlazaIo, type SafeHandlerDeps } from '../../platform/socket.js';
import { KeyedTokenBuckets, TokenBucket } from '../../platform/token-bucket.js';
import { socketUserId } from '../auth/index.js';
import type { WorldService } from './world.service.js';

/** Rate limit of `space:join` per person: `burst` joins, refilled over `windowMs`. */
export interface JoinRateLimit {
  burst: number;
  windowMs: number;
}

/** Default join limit: 5 per 10 s per person, across all their connections. */
export const DEFAULT_JOIN_RATE_LIMIT: JoinRateLimit = {
  burst: SPACE_JOIN_BURST,
  windowMs: SPACE_JOIN_WINDOW_MS,
};

/**
 * Socket.IO adapter of the world module (E4). Runs after the handshake authentication of the
 * auth module: every socket here has `socket.data.userId`. Handlers go through `safeHandler`
 * (`PROTOCOL_MISMATCH`, zod validation, errors as acks or `error` events).
 */
export function registerWorldSocket(
  io: PlazaIo,
  deps: SafeHandlerDeps,
  world: WorldService,
  clock: () => number,
  joinLimit: JoinRateLimit = DEFAULT_JOIN_RATE_LIMIT,
): void {
  // Each join loads the member, the space, its rooms and desks: a person (all their tabs and
  // sockets together) may join a few times in a row, then only every `windowMs / burst`.
  const joins = new KeyedTokenBuckets({
    capacity: joinLimit.burst,
    refillPerSecond: (joinLimit.burst * 1000) / joinLimit.windowMs,
    now: clock,
  });

  io.on('connection', (socket) => {
    // Architecture §11.1: one token bucket per socket, 10 steps per second (E4-S3).
    const moves = new TokenBucket({
      capacity: MOVE_RATE_PER_SEC,
      refillPerSecond: MOVE_RATE_PER_SEC,
      now: clock,
    });

    socket.on(
      'space:join',
      safeHandler(deps, socket, 'space:join', (payload) => {
        if (!joins.tryTake(socketUserId(socket))) {
          throw new AppError('RATE_LIMITED', 'Too many space:join, wait a few seconds');
        }
        return world.join(socket, payload.spaceId);
      }),
    );
    socket.on(
      'player:move',
      safeHandler(deps, socket, 'player:move', (payload) => {
        world.move(socket, moves, payload);
        return undefined;
      }),
    );
    socket.on('disconnect', (reason) => {
      world.disconnected(socket, reason);
    });
  });
}
