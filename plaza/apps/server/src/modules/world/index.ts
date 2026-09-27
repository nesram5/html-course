import { MAX_PLAYERS_PER_SPACE } from '@plaza/shared';

import { systemTimers, type Timers } from '../../platform/timers.js';
import type { PlazaModule } from '../types.js';
import { registerDeskGoto } from './desk-goto.js';
import { WorldRepository } from './world.repository.js';
import { WorldService } from './world.service.js';
import { registerWorldSocket, type JoinRateLimit } from './world.socket.js';

export { SpaceRuntime } from './space-runtime.js';
export type { SpaceStateStore } from './space-state-store.js';
export { spaceRoom, type WorldService } from './world.service.js';

declare module '../types.js' {
  interface ModuleServices {
    world: WorldService;
  }
}

export interface WorldModuleOptions {
  /** Ticks, reconnection grace, runtime unload and move rate limit; tests pass `ManualTimers`. */
  timers?: Timers;
  /** `space:join` rate limit per person (default 5 per 10 s). */
  joinLimit?: JoinRateLimit;
}

/**
 * World module (E4): live state of each space (`SpaceRuntime` in a `SpaceStateStore`),
 * `space:join`, movement validation, the 15 Hz tick, reconnection grace and kicks.
 * Needs `auth` (socket handshake), `spaces` (membership, rooms, kicks), `media` (server-side
 * mute, publish permission and removal) and `events` (`room_entered`) registered before it.
 */
export function createWorldModule(options: WorldModuleOptions = {}): PlazaModule {
  return {
    name: 'world',
    register({ app, io, container, services, socketDeps }) {
      const spaces = services.get('spaces');
      const timers = options.timers ?? systemTimers;
      const repository = new WorldRepository(container.db);
      const media = services.get('media');
      const world = new WorldService({
        io,
        repository,
        spaces: spaces.service,
        maps: container.maps,
        media,
        events: services.get('events'),
        metrics: container.metrics,
        timers,
        logger: container.logger,
        reporter: container.reporter,
        maxPlayersPerSpace: Math.min(
          container.config.realtime.maxPlayersPerSpace ?? MAX_PLAYERS_PER_SPACE,
          MAX_PLAYERS_PER_SPACE,
        ),
      });
      // Media tokens issued inside a meeting room do not allow publishing (E6-S3).
      media.trackMeetingRooms((spaceId, userId) => world.inMeetingRoom(spaceId, userId));
      // Someone who connects to the media server from inside a room is isolated again (E6-S3).
      media.onParticipantActive((spaceId, userId) => {
        world.mediaParticipantActive(spaceId, userId);
      });
      registerWorldSocket(io, socketDeps, world, () => timers.now(), options.joinLimit);
      registerDeskGoto(io, socketDeps, world, repository, () => timers.now());
      spaces.notifier.onKick((spaceId, userId, reason) => {
        world.kicked(spaceId, userId, reason);
      });
      app.addHook('onClose', (_instance, done) => {
        world.close();
        done();
      });
      services.provide('world', world);
    },
  };
}

export const worldModule: PlazaModule = createWorldModule();
