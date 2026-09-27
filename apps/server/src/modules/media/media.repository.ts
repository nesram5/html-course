import type { Database } from '../../platform/db.js';
import type { MediaMembers } from './media.service.js';

/** Prisma access of the media module: only reads memberships. */
export class MediaRepository implements MediaMembers {
  constructor(private readonly db: Database) {}

  async findMemberDisplayName(spaceId: string, userId: string): Promise<string | null> {
    const membership = await this.db.membership.findUnique({
      where: { userId_spaceId: { userId, spaceId } },
      select: { user: { select: { displayName: true } } },
    });
    return membership?.user.displayName ?? null;
  }
}
