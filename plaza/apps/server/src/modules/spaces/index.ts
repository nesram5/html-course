import type { PlazaModule } from '../types.js';
import { SpaceNotifier } from './space-notifier.js';
import { registerSpacesRoutes } from './spaces.routes.js';
import { SpacesService } from './spaces.service.js';

export type { KickListener, SpaceNotifier } from './space-notifier.js';
export type { SpacesService } from './spaces.service.js';
export { mergeRooms } from './space-rooms.js';

/** What the spaces module offers to later modules (rooms, world, desks, chat…). */
export interface SpacesApi {
  /** Includes the `assertMember` / `assertOwner` guards. */
  service: SpacesService;
  /** `space:kicked` and `room:updated` to the sockets of a space. */
  notifier: SpaceNotifier;
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
export const spacesModule: PlazaModule = {
  name: 'spaces',
  register({ app, io, container, services }) {
    const notifier = new SpaceNotifier(io);
    const service = new SpacesService({
      db: container.db,
      maps: container.maps,
      notifier,
      logger: container.logger,
      reporter: container.reporter,
      secret: container.config.sessionSecret,
      publicUrl: container.config.publicUrl,
    });
    registerSpacesRoutes(app, {
      spaces: service,
      maps: container.maps,
      requireUser: services.get('auth').requireUser,
    });
    services.provide('spaces', { service, notifier });
  },
};
