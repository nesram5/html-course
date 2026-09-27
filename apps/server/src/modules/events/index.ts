import type { BululuModule } from '../types.js';
import { EventsRepository } from './events.repository.js';
import { registerEventsRoutes } from './events.routes.js';
import { EventsService } from './events.service.js';

export { actorIdOf, type EventProps, type RecordEventInput } from './events.service.js';
export type { EventsService } from './events.service.js';

declare module '../types.js' {
  interface ModuleServices {
    events: EventsService;
  }
}

/**
 * Events module (E6-S2, E8-S7): product events without personal data (`ProductEvent`) and the
 * client telemetry of the O1–O6 metrics. Registered right after `spaces`, so every later module
 * (rooms, world…) can record events with `services.get('events').record(...)`.
 */
export const eventsModule: BululuModule = {
  name: 'events',
  register({ app, container, services }) {
    const events = new EventsService({
      repository: new EventsRepository(container.db),
      spaces: services.get('spaces').service,
      logger: container.logger,
      reporter: container.reporter,
      secret: container.config.sessionSecret,
      now: container.now,
    });
    registerEventsRoutes(app, { events, requireUser: services.get('auth').requireUser });
    app.addHook('onClose', async () => {
      await events.flush();
    });
    services.provide('events', events);
  },
};
