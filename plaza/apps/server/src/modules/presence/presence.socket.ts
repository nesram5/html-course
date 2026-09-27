import { PRESENCE_RATE_PER_SEC } from '@plaza/shared';

import { AppError } from '../../platform/errors.js';
import { safeHandler, type PlazaIo, type SafeHandlerDeps } from '../../platform/socket.js';
import { TokenBucket } from '../../platform/token-bucket.js';
import type { PresenceService } from './presence.service.js';

/**
 * Socket.IO adapter of the presence module (E7-S1, E7-S5): `player:status`, `player:away` and
 * `ring:send`, all through `safeHandler`. Status and away share one token bucket per socket
 * (each status change is a database write).
 */
export function registerPresenceSocket(
  io: PlazaIo,
  deps: SafeHandlerDeps,
  presence: PresenceService,
  clock: () => number,
): void {
  io.on('connection', (socket) => {
    const changes = new TokenBucket({
      capacity: PRESENCE_RATE_PER_SEC * 2,
      refillPerSecond: PRESENCE_RATE_PER_SEC,
      now: clock,
    });
    const take = (): void => {
      if (!changes.tryTake()) throw new AppError('RATE_LIMITED', 'Too many presence changes');
    };

    socket.on(
      'player:status',
      safeHandler(deps, socket, 'player:status', async (payload) => {
        take();
        await presence.setStatus(socket, payload.status);
        return undefined;
      }),
    );
    socket.on(
      'player:away',
      safeHandler(deps, socket, 'player:away', (payload) => {
        take();
        presence.setAway(socket, payload.away);
        return undefined;
      }),
    );
    socket.on(
      'ring:send',
      safeHandler(deps, socket, 'ring:send', (payload) => {
        presence.ring(socket, payload.toUserId);
        return null;
      }),
    );
  });
}
