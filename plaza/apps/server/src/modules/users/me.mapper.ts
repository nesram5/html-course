import { DISPLAY_NAME_MAX_LEN, type Me } from '@plaza/shared';
import type { User } from '@prisma/client';

/** `User` row → `Me` DTO (`GET /api/me`, test login). */
export function toMeDto(user: User): Me {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    avatarId: user.avatarId,
    avatarChosen: user.avatarChosenAt !== null,
    pictureUrl: user.pictureUrl,
  };
}

/** Display name of a new user: the Google name, trimmed to the allowed length (E1-S2). */
export function initialDisplayName(name: string, email: string): string {
  const trimmed = name.trim().slice(0, DISPLAY_NAME_MAX_LEN).trim();
  if (trimmed !== '') return trimmed;
  const local = (email.split('@')[0] ?? '').slice(0, DISPLAY_NAME_MAX_LEN);
  return local === '' ? 'Plaza' : local;
}
