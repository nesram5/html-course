import { DeskDecorSchema, type DeskDecor, type DeskState } from '@bululu/shared';
import type { Membership, Prisma } from '@prisma/client';

import type { Database } from '../../platform/db.js';

type DbClient = Database | Prisma.TransactionClient;

/** A membership that holds a desk, with the name shown over it. */
export type DeskHolder = Membership & { user: { displayName: string } };

const WITH_NAME = { user: { select: { displayName: true } } } as const;

/** `desk:updated` / REST view of a held desk (decor rows that fail validation read as none). */
export function deskStateOf(holder: DeskHolder): DeskState | null {
  if (holder.deskId === null) return null;
  const decor = DeskDecorSchema.safeParse(holder.deskDecor);
  return {
    deskId: holder.deskId,
    userId: holder.userId,
    displayName: holder.user.displayName,
    decor: decor.success ? decor.data : null,
  };
}

/** Prisma access of the desks module: `Membership.deskId` and `Membership.deskDecor` (E9). */
export class DesksRepository {
  constructor(private readonly db: DbClient) {}

  findMembership(spaceId: string, userId: string): Promise<Membership | null> {
    return this.db.membership.findUnique({ where: { userId_spaceId: { userId, spaceId } } });
  }

  /** Who holds the desk, `null` when it is free. */
  findHolder(spaceId: string, deskId: string): Promise<DeskHolder | null> {
    return this.db.membership.findFirst({ where: { spaceId, deskId }, include: WITH_NAME });
  }

  /** Occupied desks of the space, by desk id. */
  listHeld(spaceId: string): Promise<DeskHolder[]> {
    return this.db.membership.findMany({
      where: { spaceId, deskId: { not: null } },
      include: WITH_NAME,
      orderBy: { deskId: 'asc' },
    });
  }

  /**
   * Gives the desk to the member, freeing the one they had. The unique `(spaceId, deskId)`
   * constraint rejects a desk that someone else took meanwhile (Prisma `P2002`).
   */
  setDesk(spaceId: string, userId: string, deskId: string): Promise<DeskHolder> {
    return this.db.membership.update({
      where: { userId_spaceId: { userId, spaceId } },
      data: { deskId },
      include: WITH_NAME,
    });
  }

  /** Frees the desk if the member still holds it; `false` when they did not. */
  async clearDesk(spaceId: string, userId: string, deskId: string): Promise<boolean> {
    const { count } = await this.db.membership.updateMany({
      where: { spaceId, userId, deskId },
      data: { deskId: null },
    });
    return count > 0;
  }

  setDecor(spaceId: string, userId: string, decor: DeskDecor): Promise<DeskHolder> {
    return this.db.membership.update({
      where: { userId_spaceId: { userId, spaceId } },
      data: { deskDecor: { slots: decor.slots } },
      include: WITH_NAME,
    });
  }
}
