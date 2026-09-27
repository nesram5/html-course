import type { PlazaModule } from '../types.js';
import { registerDesksRoutes } from './desks.routes.js';
import { DesksService } from './desks.service.js';

export type { DesksService } from './desks.service.js';

declare module '../types.js' {
  interface ModuleServices {
    desks: DesksService;
  }
}

/**
 * Desks module (E9-S2, E9-S3): decoration catalog, claim / assign / free desks and decorate
 * one's own desk. Broadcasts `desk:updated` through the spaces notifier. The office style
 * (E9-S1) is a space setting: `PATCH /api/spaces/:spaceId` in the spaces module.
 */
export const desksModule: PlazaModule = {
  name: 'desks',
  register({ app, container, services }) {
    const spaces = services.get('spaces');
    const desks = new DesksService({
      db: container.db,
      maps: container.maps,
      spaces: spaces.service,
      notifier: spaces.notifier,
      serial: spaces.deskChanges,
    });
    registerDesksRoutes(app, { desks, requireUser: services.get('auth').requireUser });
    services.provide('desks', desks);
  },
};
