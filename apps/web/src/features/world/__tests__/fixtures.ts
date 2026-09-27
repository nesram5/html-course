import {
  PROTOCOL_VERSION,
  type PublicPlayer,
  type SpaceSnapshot,
  type WorldDelta,
  type WorldMap,
} from '@bululu/shared';

/**
 * A 6×5 test map (`#` blocks). Room "sala" covers x 3..4, y 1..2.
 *
 *   ######
 *   #..RR#
 *   #.#RR#
 *   #....#
 *   ######
 */
export function testMap(): WorldMap {
  const rows = ['######', '#..RR#', '#.#RR#', '#....#', '######'];
  return {
    width: 6,
    height: 5,
    collisionGrid: Uint8Array.from(rows.join('').split(''), (c) => (c === '#' ? 1 : 0)),
    rooms: [{ x: 3, y: 1, width: 2, height: 2, areaId: 'sala', name: 'Sala' }],
    spawns: [
      { x: 1, y: 1 },
      { x: 1, y: 3 },
    ],
    desks: [],
  };
}

/** A connected person as the server sends it (`PublicPlayer`). */
export function testPlayer(overrides: Partial<PublicPlayer> = {}): PublicPlayer {
  return {
    userId: 'user-2',
    displayName: 'Luis',
    avatarId: 'avatar-02',
    x: 1,
    y: 3,
    dir: 'down',
    status: 'available',
    away: false,
    roomId: null,
    inConversation: false,
    reconnecting: false,
    ...overrides,
  };
}

/** A valid `space:snapshot` for `space-1`, with me (`user-1`) at (1, 1) and Luis at (1, 3). */
export function testSnapshot(overrides: Partial<SpaceSnapshot> = {}): SpaceSnapshot {
  return {
    v: PROTOCOL_VERSION,
    spaceId: 'space-1',
    mapTemplateId: 'office-small@1',
    themeId: 'pixel',
    self: testPlayer({ userId: 'user-1', displayName: 'Ana', avatarId: 'avatar-04', x: 1, y: 1 }),
    players: [testPlayer()],
    rooms: [],
    desks: [],
    ...overrides,
  };
}

/** A `world:delta` with only the given changes. */
export function testDelta(overrides: Partial<WorldDelta> = {}): WorldDelta {
  return { moved: [], joined: [], left: [], changed: [], ...overrides };
}
