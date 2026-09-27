import { MemberDeskCell } from '@/features/personalization';
import type { SpaceSettingsExtensions } from '@/features/spaces';

/**
 * UI other features add to the space settings (`/spaces/:spaceId/settings`). Wired here so
 * `spaces` never imports `personalization` (which depends on `world`, which uses `spaces`).
 */
export const spaceSettingsExtensions: SpaceSettingsExtensions = {
  MemberDeskCell,
};
