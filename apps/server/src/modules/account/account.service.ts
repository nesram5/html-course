import type { AccountDeletionPreview } from '@bululu/shared';
import type { Prisma } from '@prisma/client';

import type { Database } from '../../platform/db.js';
import { AppError } from '../../platform/errors.js';
import type { KeyedSerial } from '../../platform/keyed-serial.js';
import type { Logger } from '../../platform/logger.js';
import type { BululuIo } from '../../platform/socket.js';
import { freeDesk, type SpaceNotifier } from '../spaces/index.js';

type Tx = Prisma.TransactionClient | Database;

interface MembershipFacts {
  readonly spaceId: string;
  readonly spaceName: string;
  readonly spaceOwnerId: string;
  readonly role: 'OWNER' | 'MEMBER';
  readonly deskId: string | null;
  readonly members: number;
  readonly owners: number;
}

export interface AccountServiceDeps {
  db: Database;
  io: BululuIo;
  notifier: SpaceNotifier;
  /** Per-space desk queue of the spaces module (claims, member removal): see `deleteAccount`. */
  deskChanges: KeyedSerial;
  logger: Logger;
}

function isBlocking(facts: MembershipFacts): boolean {
  return facts.role === 'OWNER' && facts.owners <= 1 && facts.members > 1;
}

/**
 * "Borrar mi cuenta" (E8-S6, RNF-06). Deleting the `User` row cascades to sessions,
 * memberships (so desks are freed, RN-13), bans and feedback; chat messages keep their text with
 * `authorId = null` ("Usuario eliminado"). Spaces where the person was the only member go with
 * the account. Being the only owner of a space with other members blocks the deletion
 * (409 `SOLE_OWNER`): nobody could manage that space afterwards.
 */
export class AccountService {
  constructor(private readonly deps: AccountServiceDeps) {}

  async preview(userId: string): Promise<AccountDeletionPreview> {
    return this.#preview(await this.#facts(this.deps.db, userId));
  }

  /**
   * Runs in the desk queue of every space of the person (E8-S2): a desk claim or assignment
   * queued around the deletion cannot leave the others seeing a desk held by a deleted account.
   * The queues are always taken in the same (sorted) order.
   */
  async deleteAccount(userId: string): Promise<void> {
    const spaceIds = (
      await this.deps.db.membership.findMany({ where: { userId }, select: { spaceId: true } })
    )
      .map((membership) => membership.spaceId)
      .sort();
    const task = spaceIds.reduceRight<() => Promise<void>>(
      (inner, spaceId) => () => this.deps.deskChanges.run(spaceId, inner),
      () => this.#deleteAccount(userId),
    );
    await task();
  }

  async #deleteAccount(userId: string): Promise<void> {
    const memberships = await this.deps.db.$transaction(async (tx) => {
      const facts = await this.#facts(tx, userId);
      const blocking = facts.filter(isBlocking);
      if (blocking.length > 0) {
        throw new AppError(
          'SOLE_OWNER',
          `Only owner of ${String(blocking.length)} space(s) with other members`,
        );
      }
      const alone = facts.filter((f) => f.members <= 1).map((f) => f.spaceId);
      // Spaces that keep going: another owner becomes the recorded creator.
      for (const f of facts) {
        if (f.members <= 1 || f.spaceOwnerId !== userId) continue;
        const heir = await tx.membership.findFirst({
          where: { spaceId: f.spaceId, role: 'OWNER', userId: { not: userId } },
          orderBy: { joinedAt: 'asc' },
          select: { userId: true },
        });
        if (heir !== null) {
          await tx.space.update({ where: { id: f.spaceId }, data: { ownerId: heir.userId } });
        }
      }
      await tx.space.deleteMany({ where: { id: { in: alone } } });
      await tx.user.delete({ where: { id: userId } });
      return facts;
    });
    this.deps.logger.info({ userId, spaces: memberships.length }, 'Account deleted');
    await this.#disconnect(userId, memberships);
  }

  /** Out of every space at once (avatar, media), desks freed for the others, sockets closed. */
  async #disconnect(userId: string, memberships: readonly MembershipFacts[]): Promise<void> {
    for (const membership of memberships) {
      await this.deps.notifier.kick(membership.spaceId, userId, 'ACCOUNT_DELETED');
      if (membership.deskId !== null && membership.members > 1) {
        await this.deps.notifier.deskUpdated(membership.spaceId, freeDesk(membership.deskId));
      }
    }
    for (const socket of await this.deps.io.fetchSockets()) {
      if (socket.data.userId === userId) socket.disconnect(true);
    }
  }

  #preview(facts: readonly MembershipFacts[]): AccountDeletionPreview {
    const ref = (f: MembershipFacts) => ({ id: f.spaceId, name: f.spaceName });
    return {
      blockingSpaces: facts.filter(isBlocking).map(ref),
      spacesDeleted: facts.filter((f) => f.members <= 1).map(ref),
    };
  }

  async #facts(db: Tx, userId: string): Promise<MembershipFacts[]> {
    const memberships = await db.membership.findMany({
      where: { userId },
      orderBy: { joinedAt: 'asc' },
      include: {
        space: { select: { name: true, ownerId: true, _count: { select: { memberships: true } } } },
      },
    });
    const spaceIds = memberships.map((membership) => membership.spaceId);
    const owners = await db.membership.groupBy({
      by: ['spaceId'],
      where: { spaceId: { in: spaceIds }, role: 'OWNER' },
      _count: { _all: true },
    });
    const ownersBySpace = new Map(owners.map((row) => [row.spaceId, row._count._all]));
    return memberships.map((membership) => ({
      spaceId: membership.spaceId,
      spaceName: membership.space.name,
      spaceOwnerId: membership.space.ownerId,
      role: membership.role,
      deskId: membership.deskId,
      members: membership.space._count.memberships,
      owners: ownersBySpace.get(membership.spaceId) ?? 0,
    }));
  }
}
