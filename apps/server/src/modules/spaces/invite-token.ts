import { createHmac } from 'node:crypto';

/**
 * Invite token of a space (E2-S4): HMAC-SHA256 of `SESSION_SECRET`, the space id and the invite
 * version. Only its SHA-256 is stored (`Space.inviteTokenHash`); the server re-derives it to show
 * "Copy link" to owners, and bumping `inviteVersion` revokes the previous link.
 * No workspace imports: the Prisma seed uses it too.
 */
export function deriveInviteToken(secret: string, spaceId: string, version: number): string {
  return createHmac('sha256', secret)
    .update(`invite:${spaceId}:${String(version)}`)
    .digest('base64url');
}
