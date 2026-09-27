import type { Session, User } from '@prisma/client';

import type { Database } from '../../platform/db.js';

export interface IdentityUpsert {
  googleSub: string;
  email: string;
  /** Used only when the user is created: later logins never overwrite the chosen name. */
  displayName: string;
  pictureUrl: string | null;
}

export type SessionWithUser = Session & { user: User };

/** Prisma access for users (by Google subject) and sessions. */
export class AuthRepository {
  constructor(private readonly db: Database) {}

  /** One `User` per `googleSub`; e-mail and picture follow Google on every login (E1-S1). */
  upsertUser(input: IdentityUpsert): Promise<User> {
    return this.db.user.upsert({
      where: { googleSub: input.googleSub },
      create: {
        googleSub: input.googleSub,
        email: input.email,
        displayName: input.displayName,
        pictureUrl: input.pictureUrl,
      },
      update: { email: input.email, pictureUrl: input.pictureUrl },
    });
  }

  createSession(input: { id: string; userId: string; expiresAt: Date }): Promise<Session> {
    return this.db.session.create({ data: input });
  }

  findSession(id: string): Promise<SessionWithUser | null> {
    return this.db.session.findUnique({ where: { id }, include: { user: true } });
  }

  async extendSession(id: string, expiresAt: Date): Promise<void> {
    await this.db.session.updateMany({ where: { id }, data: { expiresAt } });
  }

  async deleteSession(id: string): Promise<void> {
    await this.db.session.deleteMany({ where: { id } });
  }
}
