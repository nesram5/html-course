import type { User } from '@prisma/client';

import type { Database } from '../../platform/db.js';

export interface UserProfileUpdate {
  displayName?: string;
  avatarId?: string;
  avatarChosenAt?: Date;
}

/** Prisma access for user profiles. */
export class UsersRepository {
  constructor(private readonly db: Database) {}

  findById(id: string): Promise<User | null> {
    return this.db.user.findUnique({ where: { id } });
  }

  update(id: string, data: UserProfileUpdate): Promise<User> {
    return this.db.user.update({ where: { id }, data });
  }
}
