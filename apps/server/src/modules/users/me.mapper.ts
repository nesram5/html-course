import { DISPLAY_NAME_MAX_LEN, stripNameControls, type Me } from '@bululu/shared';
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

/**
 * Display name of a new user: the Google name without control characters, trimmed to the
 * allowed length (E1-S2), so it always passes `DisplayNameSchema`.
 */
export function initialDisplayName(name: string, email: string): string {
  const trimmed = stripNameControls(name).trim().slice(0, DISPLAY_NAME_MAX_LEN).trim();
  if (trimmed !== '') return trimmed;
  const local = stripNameControls(email.split('@')[0] ?? '').slice(0, DISPLAY_NAME_MAX_LEN);
  return local === '' ? 'Plaza' : local;
}

/** Whether an e-mail is listed in `ADMIN_EMAILS` (already lowercased by the config). */
export function isAdminEmail(adminEmails: readonly string[], email: string): boolean {
  return adminEmails.includes(email.trim().toLowerCase());
}
