import { MAX_PLAYERS_PER_SPACE } from '@plaza/shared';

import { systemTimers, type Timers } from '../../platform/timers.js';
import type { PlazaModule } from '../types.js';
import { registerDeskGoto } from './desk-goto.js';
import { WorldRepository } from './world.repository.js';
import { WorldService } from './world.service.js';
import { registerWorldSocket } from './world.socket.js';

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
}

/**
 * World module (E4): live state of each space (`SpaceRuntime` in a `SpaceStateStore`),
 * `space:join`, movement validation, the 15 Hz tick, reconnection grace and kicks.
 * Needs `auth` (socket handshake), `spaces` (membership, rooms, kicks) and `media` (server-side
 * mute and removal) registered before it.
 */
export function createWorldModule(options: WorldModuleOptions = {}): PlazaModule {
  return {
    name: 'world',
    register({ app, io, container, services, socketDeps }) {
      const spaces = services.get('spaces');
      const timers = options.timers ?? systemTimers;
      const repository = new WorldRepository(container.db);
      const world = new WorldService({
        io,
        repository,
        spaces: spaces.service,
        maps: container.maps,
        media: services.get('media'),
        metrics: container.metrics,
        timers,
        logger: container.logger,
        reporter: container.reporter,
        maxPlayersPerSpace: Math.min(
          container.config.realtime.maxPlayersPerSpace ?? MAX_PLAYERS_PER_SPACE,
          MAX_PLAYERS_PER_SPACE,
        ),
      });
      registerWorldSocket(io, socketDeps, world, () => timers.now());
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
