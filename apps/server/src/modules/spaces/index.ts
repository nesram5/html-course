import { KeyedSerial } from '../../platform/keyed-serial.js';
import type { BululuModule } from '../types.js';
import { SpaceNotifier } from './space-notifier.js';
import { registerSpacesRoutes } from './spaces.routes.js';
import { SpacesService } from './spaces.service.js';

export type { KickListener, SpaceNotifier } from './space-notifier.js';
export { freeDesk, type SpacesService } from './spaces.service.js';
export { mergeRooms } from './space-rooms.js';

/** What the spaces module offers to later modules (rooms, world, desks, chat…). */
export interface SpacesApi {
  /** Includes the `assertMember` / `assertOwner` guards. */
  service: SpacesService;
  /** `space:kicked` and `room:updated` to the sockets of a space. */
  notifier: SpaceNotifier;
  /**
   * Desk changes of each space run one at a time through this queue (keyed by space id): the
   * desks module and member removal share it, so `desk:updated` follows the database order.
   */
  deskChanges: KeyedSerial;
}

declare module '../types.js' {
  interface ModuleServices {
    spaces: SpacesApi;
  }
}

/**
 * Spaces module (E2-S2..S6): create and list spaces, map templates, invite link, allowed domain,
 * join by link or by domain, members and kick.
 */
export const spacesModule: BululuModule = {
  name: 'spaces',
  register({ app, io, container, services }) {
    const notifier = new SpaceNotifier(io);
    const deskChanges = new KeyedSerial();
    const service = new SpacesService({
      db: container.db,
      maps: container.maps,
      notifier,
      logger: container.logger,
      reporter: container.reporter,
      secret: container.config.sessionSecret,
      publicUrl: container.config.publicUrl,
      deskChanges,
    });
    registerSpacesRoutes(app, {
      spaces: service,
      maps: container.maps,
      requireUser: services.get('auth').requireUser,
    });
    services.provide('spaces', { service, notifier, deskChanges });
  },
};
