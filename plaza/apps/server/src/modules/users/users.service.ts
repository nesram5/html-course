import type { AvatarDto, Me, UpdateMeBody } from '@plaza/shared';

import { AppError } from '../../platform/errors.js';
import type { MapsCatalog } from '../../platform/maps-catalog.js';
import { isAdminEmail, toMeDto } from './me.mapper.js';
import type { UsersRepository } from './users.repository.js';

/** Profile use cases (E1-S4): my user, display name and avatar. */
export class UsersService {
  constructor(
    private readonly repository: UsersRepository,
    private readonly maps: MapsCatalog,
    private readonly now: () => Date,
    private readonly adminEmails: readonly string[] = [],
  ) {}

  /** My user; `isAdmin` tells the web app to link the metrics page (E8-S7). */
  async me(userId: string): Promise<Me> {
    const user = await this.repository.findById(userId);
    if (user === null) throw new AppError('UNAUTHORIZED');
    return { ...toMeDto(user), isAdmin: isAdminEmail(this.adminEmails, user.email) };
  }

  /** Unknown `avatarId` → 400 `UNKNOWN_AVATAR`. Choosing an avatar marks it as chosen. */
  async updateMe(userId: string, body: UpdateMeBody): Promise<Me> {
    if (body.avatarId !== undefined && !this.maps.hasAvatar(body.avatarId)) {
      throw new AppError('UNKNOWN_AVATAR', `Unknown avatar "${body.avatarId}"`);
    }
    const user = await this.repository.update(userId, {
      ...(body.displayName !== undefined && { displayName: body.displayName }),
      ...(body.avatarId !== undefined && { avatarId: body.avatarId, avatarChosenAt: this.now() }),
    });
    return toMeDto(user);
  }

  avatars(): AvatarDto[] {
    return this.maps.listAvatars();
  }
}
