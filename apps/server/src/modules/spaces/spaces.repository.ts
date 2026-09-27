import type { MeetingRoom, Membership, Prisma, Role, Space, SpaceBan, User } from '@prisma/client';

import type { Database } from '../../platform/db.js';

/** Prisma client or the client of an open transaction. */
export type DbClient = Database | Prisma.TransactionClient;

export type SpaceWithRooms = Space & { rooms: MeetingRoom[] };
export type MembershipWithSpace = Membership & { space: Space };
export type MembershipWithUser = Membership & { user: User };
export type SpaceBanWithUser = SpaceBan & { user: User };

export interface NewSpace {
  name: string;
  slug: string;
  mapTemplateId: string;
  themeId: string;
  ownerId: string;
  inviteTokenHash: string;
}

/** Prisma access for spaces and memberships. */
export class SpacesRepository {
  constructor(private readonly db: DbClient) {}

  createSpace(data: NewSpace): Promise<Space> {
    return this.db.space.create({ data });
  }

  updateSpace(
    id: string,
    data: Partial<
      Pick<Space, 'name' | 'allowedDomain' | 'themeId' | 'inviteTokenHash' | 'inviteVersion'>
    >,
  ): Promise<Space> {
    return this.db.space.update({ where: { id }, data });
  }

  findSpace(id: string): Promise<SpaceWithRooms | null> {
    return this.db.space.findUnique({ where: { id }, include: { rooms: true } });
  }

  findSpaceBySlug(slug: string): Promise<SpaceWithRooms | null> {
    return this.db.space.findUnique({ where: { slug }, include: { rooms: true } });
  }

  findSpaceByInviteHash(
    inviteTokenHash: string,
  ): Promise<(Space & { memberCount: number }) | null> {
    return this.db.space
      .findUnique({
        where: { inviteTokenHash },
        include: { _count: { select: { memberships: true } } },
      })
      .then((space) => {
        if (space === null) return null;
        const { _count, ...rest } = space;
        return { ...rest, memberCount: _count.memberships };
      });
  }

  async slugsStartingWith(base: string): Promise<Set<string>> {
    const rows = await this.db.space.findMany({
      where: { slug: { startsWith: base } },
      select: { slug: true },
    });
    return new Set(rows.map((row) => row.slug));
  }

  findMembership(spaceId: string, userId: string): Promise<Membership | null> {
    return this.db.membership.findUnique({ where: { userId_spaceId: { userId, spaceId } } });
  }

  addMember(spaceId: string, userId: string, role: Role): Promise<Membership> {
    return this.db.membership.create({ data: { spaceId, userId, role } });
  }

  async removeMember(spaceId: string, userId: string): Promise<void> {
    await this.db.membership.deleteMany({ where: { spaceId, userId } });
  }

  async setRole(spaceId: string, userId: string, role: Role): Promise<void> {
    await this.db.membership.updateMany({ where: { spaceId, userId }, data: { role } });
  }

  countOwners(spaceId: string): Promise<number> {
    return this.db.membership.count({ where: { spaceId, role: 'OWNER' } });
  }

  listMembershipsOfUser(userId: string): Promise<MembershipWithSpace[]> {
    return this.db.membership.findMany({
      where: { userId },
      include: { space: true },
      orderBy: { joinedAt: 'asc' },
    });
  }

  listMembers(spaceId: string): Promise<MembershipWithUser[]> {
    return this.db.membership.findMany({
      where: { spaceId },
      include: { user: true },
      orderBy: { joinedAt: 'asc' },
    });
  }

  findUser(id: string): Promise<User | null> {
    return this.db.user.findUnique({ where: { id } });
  }

  // ── Bans (E2-S6 follow-up) ────────────────────────────────────────────────

  async isBanned(spaceId: string, userId: string): Promise<boolean> {
    const ban = await this.db.spaceBan.findUnique({
      where: { spaceId_userId: { spaceId, userId } },
    });
    return ban !== null;
  }

  async ban(spaceId: string, userId: string): Promise<void> {
    await this.db.spaceBan.upsert({
      where: { spaceId_userId: { spaceId, userId } },
      create: { spaceId, userId },
      update: {},
    });
  }

  /** `false` when the person was not banned. */
  async unban(spaceId: string, userId: string): Promise<boolean> {
    const { count } = await this.db.spaceBan.deleteMany({ where: { spaceId, userId } });
    return count > 0;
  }

  listBans(spaceId: string): Promise<SpaceBanWithUser[]> {
    return this.db.spaceBan.findMany({
      where: { spaceId },
      include: { user: true },
      orderBy: { createdAt: 'desc' },
    });
  }
}
