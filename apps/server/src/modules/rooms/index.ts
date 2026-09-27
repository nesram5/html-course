import type { BululuModule } from '../types.js';
import { RoomsRepository } from './rooms.repository.js';
import { registerRoomsRoutes } from './rooms.routes.js';
import { RoomsService } from './rooms.service.js';

export type { RoomsService } from './rooms.service.js';

declare module '../types.js' {
  interface ModuleServices {
    rooms: RoomsService;
  }
}

/**
 * Rooms module (E2-S7): Google Meet link per meeting room, created through the Meet API after an
 * incremental authorization (token used once and discarded) or pasted by hand.
 */
export const roomsModule: BululuModule = {
  name: 'rooms',
  register({ app, container, services }) {
    const spaces = services.get('spaces');
    const rooms = new RoomsService({
      repository: new RoomsRepository(container.db),
      spaces: spaces.service,
      notifier: spaces.notifier,
      meetings: container.meetings,
    });
    registerRoomsRoutes(app, {
      rooms,
      meetings: container.meetings,
      requireUser: services.get('auth').requireUser,
      config: container.config,
      logger: container.logger,
    });
    services.provide('rooms', rooms);
  },
};
