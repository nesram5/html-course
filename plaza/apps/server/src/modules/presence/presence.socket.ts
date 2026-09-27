import { PRESENCE_RATE_PER_SEC } from '@plaza/shared';

import { AppError } from '../../platform/errors.js';
import { safeHandler, type PlazaIo, type SafeHandlerDeps } from '../../platform/socket.js';
import { KeyedTokenBuckets, TokenBucket } from '../../platform/token-bucket.js';
import { socketUserId } from '../auth/index.js';
import type { PresenceService } from './presence.service.js';

/**
 * `ring:send` per person, across all their connections: a few in a row, then one per second
 * (architecture §11.1). The 30 s per-target cooldown (RN-11) is on top of this.
 */
export const RING_BURST = 3;
export const RING_PER_SECOND = 1;

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
  const rings = new KeyedTokenBuckets({
    capacity: RING_BURST,
    refillPerSecond: RING_PER_SECOND,
    now: clock,
  });

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
        if (!rings.tryTake(socketUserId(socket))) {
          throw new AppError('RATE_LIMITED', 'Too many rings, wait a moment');
        }
        presence.ring(socket, payload.toUserId);
        return null;
      }),
    );
  });
}
