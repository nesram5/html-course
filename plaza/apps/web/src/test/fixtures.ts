import type { AvatarDto, Me, SpaceDetailDto } from '@plaza/shared';

import type { SpaceInfo } from '@/features/world';

/** Test data shared by the auth and spaces feature tests. */
export function meFixture(overrides: Partial<Me> = {}): Me {
  return {
    id: 'user-ana',
    email: 'ana@acme.com',
    displayName: 'Ana',
    avatarId: 'avatar-01',
    avatarChosen: true,
    pictureUrl: null,
    ...overrides,
  };
}

export const avatarsFixture: AvatarDto[] = Array.from({ length: 8 }, (_, i) => {
  const id = `avatar-0${String(i + 1)}`;
  return {
    id,
    name: `Avatar ${String(i + 1)}`,
    spriteUrl: `/assets/maps/avatars/${id}.png`,
    frameWidth: 32,
    frameHeight: 32,
  };
});

export function spaceFixture(overrides: Partial<SpaceDetailDto> = {}): SpaceDetailDto {
  return {
    id: 'space-1',
    name: 'Oficina Acme',
    slug: 'oficina-acme',
    mapTemplateId: 'campus@1',
    themeId: 'pixel',
    role: 'OWNER',
    thumbnailUrl: '/assets/maps/templates/campus/themes/pixel/thumbnail.png',
    ownerId: 'user-ana',
    allowedDomain: null,
    createdAt: '2026-09-01T10:00:00.000Z',
    rooms: [
      { areaId: 'sala-norte', name: 'Sala Norte', meetUri: null, source: null },
      {
        areaId: 'sala-sur',
        name: 'Sala Sur',
        meetUri: 'https://meet.google.com/abc-defg-hij',
        source: 'api',
      },
    ],
    inviteUrl: 'http://localhost:5173/join/tok_abcdefghijklmnopqrstuvwxyz0123456789ABCDE',
    ...overrides,
  };
}

/**
 * What the office page hands to its extensions (`SpaceExtension` slots): Ana in "Acme", on a 4×3
 * open map with one meeting room "Sala".
 */
export function spaceInfoFixture(overrides: Partial<SpaceInfo> = {}): SpaceInfo {
  return {
    spaceId: 'space-1',
    spaceName: 'Acme',
    userId: 'user-1',
    displayName: 'Ana',
    isOwner: false,
    roomNames: { sala: 'Sala' },
    map: {
      width: 4,
      height: 3,
      collisionGrid: new Uint8Array(12),
      rooms: [{ x: 2, y: 0, width: 2, height: 2, areaId: 'sala', name: 'Sala' }],
      spawns: [{ x: 0, y: 2 }],
      desks: [],
    },
    ...overrides,
  };
}
