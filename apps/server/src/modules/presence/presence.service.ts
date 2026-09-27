import type { PresenceStatus } from '@bululu/shared';

import { AppError } from '../../platform/errors.js';
import { KeyedSerial } from '../../platform/keyed-serial.js';
import type { BululuSocket } from '../../platform/socket.js';
import type { WorldService } from '../world/index.js';
import type { PresenceRepository } from './presence.repository.js';
import type { RingCooldowns } from './ring-cooldowns.js';

export interface PresenceServiceDeps {
  world: WorldService;
  repository: PresenceRepository;
  cooldowns: RingCooldowns;
  /** Monotonic clock in milliseconds (the ring cooldown). */
  now: () => number;
}

/**
 * Presence use cases (E7-S1, E7-S5): the chosen status (persisted in `Membership.status` and
 * restored on the next `space:join`), the automatic away flag, and ringing someone. Status and
 * away live on the `PlayerState` of the space runtime, so everyone gets them in the next
 * `world:delta.changed` (the hallway media exclude busy people, RN-04).
 */
export class PresenceService {
  /** Status writes, one at a time per `spaceId:userId`, in the order they arrived. */
  readonly #saves = new KeyedSerial();

  constructor(private readonly deps: PresenceServiceDeps) {}

  /**
   * `player:status`: available / busy, for everyone and for the next visits. The runtime takes
   * it at once (synchronously, so the last request wins, like the client's menu), and the
   * writes are queued per person: two quick changes can never end in the opposite order in the
   * runtime or in the database.
   */
  async setStatus(socket: BululuSocket, status: PresenceStatus): Promise<void> {
    const { runtime, userId } = this.deps.world.joinedRuntime(socket);
    runtime.update(userId, { status });
    await this.#saves.run(`${runtime.spaceId}:${userId}`, () =>
      this.deps.repository.saveStatus(runtime.spaceId, userId, status),
    );
  }

  /** `player:away`: hidden tab or inactivity (RN-05). Not persisted. */
  setAway(socket: BululuSocket, away: boolean): void {
    const { runtime, userId } = this.deps.world.joinedRuntime(socket);
    runtime.update(userId, { away });
  }

  /**
   * `ring:send` (E7-S5): the target hears a sound and gets a browser notification; silent when
   * they are busy. Only people connected to the same space can be rung (`UNKNOWN_USER`), never
   * oneself (`VALIDATION_ERROR`), and the same target once every 30 s (`RING_COOLDOWN`, RN-11).
   */
  ring(socket: BululuSocket, toUserId: string): void {
    const { runtime, userId } = this.deps.world.joinedRuntime(socket);
    if (toUserId === userId) throw new AppError('VALIDATION_ERROR', 'You cannot ring yourself');
    const caller = runtime.get(userId);
    const target = runtime.get(toUserId);
    const targetSocket = this.deps.world.socketOf(runtime, toUserId);
    if (caller === undefined || target === undefined || targetSocket === undefined) {
      throw new AppError('UNKNOWN_USER', 'That person is not in the space right now');
    }
    const wait = this.deps.cooldowns.tryRing(runtime.spaceId, userId, toUserId, this.deps.now());
    if (wait > 0) {
      throw new AppError(
        'RING_COOLDOWN',
        `You can ring this person again in ${String(Math.ceil(wait / 1000))} s`,
      );
    }
    targetSocket.emit('ring:received', {
      fromUserId: userId,
      fromDisplayName: caller.displayName,
      silent: target.status === 'busy',
    });
  }
}
