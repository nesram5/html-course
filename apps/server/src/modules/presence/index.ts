import { systemTimers, type Timers } from '../../platform/timers.js';
import type { BululuModule } from '../types.js';
import { PresenceRepository } from './presence.repository.js';
import { PresenceService } from './presence.service.js';
import { registerPresenceSocket } from './presence.socket.js';
import { RingCooldowns } from './ring-cooldowns.js';

export { PresenceService } from './presence.service.js';

declare module '../types.js' {
  interface ModuleServices {
    presence: PresenceService;
  }
}

export interface PresenceModuleOptions {
  /** Clock of the ring cooldown and the rate limit; tests pass `ManualTimers`. */
  timers?: Timers;
}

/**
 * Presence module (E7-S1, E7-S5): chosen status, automatic away and ring. Works on the live
 * state of the world module, so it must be registered after `world`.
 */
export function createPresenceModule(options: PresenceModuleOptions = {}): BululuModule {
  return {
    name: 'presence',
    register({ io, container, services, socketDeps }) {
      const timers = options.timers ?? systemTimers;
      const presence = new PresenceService({
        world: services.get('world'),
        repository: new PresenceRepository(container.db),
        cooldowns: new RingCooldowns(),
        now: () => timers.now(),
      });
      registerPresenceSocket(io, socketDeps, presence, () => timers.now());
      services.provide('presence', presence);
    },
  };
}

export const presenceModule: BululuModule = createPresenceModule();
