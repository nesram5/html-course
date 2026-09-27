import type { PlazaModule } from '../types.js';
import { EventsRepository } from './events.repository.js';
import { registerEventsRoutes } from './events.routes.js';
import { EventsService } from './events.service.js';

export {
  EventsService,
  type ProductEventProps,
  type ProductEventRecord,
} from './events.service.js';

declare module '../types.js' {
  interface ModuleServices {
    events: EventsService;
  }
}

/**
 * Product events module (E6-S2, E8-S7): stores events without personal data for the O1–O6
 * metrics. Modules record what they see (`services.get('events').record`, e.g. `room_entered`
 * from `world`); the web client reports the rest through `POST /api/spaces/:spaceId/events`
 * (`room_meet_opened`). Needs `auth` and `spaces` registered before it.
 */
export const eventsModule: PlazaModule = {
  name: 'events',
  register({ app, container, services }) {
    const events = new EventsService({
      store: new EventsRepository(container.db),
      spaces: services.get('spaces').service,
    });
    registerEventsRoutes(app, { events, requireUser: services.get('auth').requireUser });
    services.provide('events', events);
  },
};
