import type { Database } from '../../platform/db.js';
import type { EventsStore, ProductEventRecord } from './events.service.js';

/** Prisma access of the events module: append-only `ProductEvent` rows. */
export class EventsRepository implements EventsStore {
  constructor(private readonly db: Database) {}

  async insert(event: ProductEventRecord): Promise<void> {
    await this.db.productEvent.create({
      data: {
        name: event.name,
        spaceId: event.spaceId,
        actorId: event.actorId,
        ...(event.props !== undefined && { props: event.props }),
      },
    });
  }
}
