import { MOVE_RATE_PER_SEC } from '@plaza/shared';

import { safeHandler, type PlazaIo, type SafeHandlerDeps } from '../../platform/socket.js';
import { TokenBucket } from '../../platform/token-bucket.js';
import type { WorldService } from './world.service.js';

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
): void {
  io.on('connection', (socket) => {
    // Architecture §11.1: one token bucket per socket, 10 steps per second (E4-S3).
    const moves = new TokenBucket({
      capacity: MOVE_RATE_PER_SEC,
      refillPerSecond: MOVE_RATE_PER_SEC,
      now: clock,
    });

    socket.on(
      'space:join',
      safeHandler(deps, socket, 'space:join', (payload) => world.join(socket, payload.spaceId)),
    );
    socket.on(
      'player:move',
      safeHandler(deps, socket, 'player:move', (payload) => {
        world.move(socket, moves, payload);
        return undefined;
      }),
    );
    socket.on('disconnect', () => {
      world.disconnected(socket);
    });
  });
}
