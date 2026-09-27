import type { Prisma } from '@prisma/client';

import type { Database } from '../../platform/db.js';

/** A row of `ProductEvent`: never a name, an e-mail or a raw user id (see `actorIdOf`). */
export interface ProductEventRow {
  name: string;
  spaceId: string | null;
  actorId: string | null;
  props?: Prisma.InputJsonObject;
  createdAt: Date;
}

/** Prisma access for product events and client telemetry (E8-S7). */
export class EventsRepository {
  constructor(private readonly db: Database) {}

  async insert(rows: readonly ProductEventRow[]): Promise<void> {
    if (rows.length === 0) return;
    await this.db.productEvent.createMany({ data: [...rows] });
  }

  /** The subset of `spaceIds` where the person is a member. */
  async memberSpaceIds(userId: string, spaceIds: readonly string[]): Promise<Set<string>> {
    const memberships = await this.db.membership.findMany({
      where: { userId, spaceId: { in: [...spaceIds] } },
      select: { spaceId: true },
    });
    return new Set(memberships.map((membership) => membership.spaceId));
  }
}
