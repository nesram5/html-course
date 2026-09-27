import type { PresenceStatus } from '@plaza/shared';

import type { Database } from '../../platform/db.js';

/** Prisma access of the presence module: the chosen status lives in `Membership.status`. */
export class PresenceRepository {
  constructor(private readonly db: Database) {}

  /** Saves the chosen status; a no-op when the membership is gone (removed meanwhile). */
  async saveStatus(spaceId: string, userId: string, status: PresenceStatus): Promise<void> {
    await this.db.membership.updateMany({ where: { spaceId, userId }, data: { status } });
  }
}
