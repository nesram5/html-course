import { DeskDecorSchema, PresenceStatusSchema, type DeskState } from '@plaza/shared';

import type { Database } from '../../platform/db.js';

/** What `space:join` needs to know about a member. */
export interface WorldMember {
  userId: string;
  displayName: string;
  avatarId: string;
  status: 'available' | 'busy';
  deskId: string | null;
}

/** Prisma access of the world module (read-only: positions are never stored). */
export class WorldRepository {
  constructor(private readonly db: Database) {}

  /** The member with their profile, or `null` when the person is not a member of the space. */
  async findMember(spaceId: string, userId: string): Promise<WorldMember | null> {
    const membership = await this.db.membership.findUnique({
      where: { userId_spaceId: { userId, spaceId } },
      include: { user: { select: { displayName: true, avatarId: true } } },
    });
    if (membership === null) return null;
    return {
      userId,
      displayName: membership.user.displayName,
      avatarId: membership.user.avatarId,
      status: PresenceStatusSchema.catch('available').parse(membership.status),
      deskId: membership.deskId,
    };
  }

  /** Occupied desks of the space with their owner and decoration (for `space:snapshot`). */
  async occupiedDesks(spaceId: string): Promise<DeskState[]> {
    const rows = await this.db.membership.findMany({
      where: { spaceId, deskId: { not: null } },
      select: {
        userId: true,
        deskId: true,
        deskDecor: true,
        user: { select: { displayName: true } },
      },
      orderBy: { deskId: 'asc' },
    });
    const desks: DeskState[] = [];
    for (const row of rows) {
      if (row.deskId === null) continue;
      const decor = DeskDecorSchema.safeParse(row.deskDecor);
      desks.push({
        deskId: row.deskId,
        userId: row.userId,
        displayName: row.user.displayName,
        decor: decor.success ? decor.data : null,
      });
    }
    return desks;
  }
}
