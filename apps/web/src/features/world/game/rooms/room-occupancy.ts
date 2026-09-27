import type { PublicPlayer } from '@bululu/shared';

import type { WorldState } from '../../store/world-store';

/**
 * Meeting room occupancy (E6-S4), Phaser-free: how many people stand in each room, from the
 * position of the avatars on the map (not from who joined the Meet, architecture §10.3).
 */

/** People per meeting room (`areaId` → count); rooms nobody is in are absent. */
export function roomOccupancy(
  players: Iterable<Pick<PublicPlayer, 'roomId'>>,
  selfRoomId: string | null,
): ReadonlyMap<string, number> {
  const counts = new Map<string, number>();
  const add = (roomId: string | null) => {
    if (roomId !== null) counts.set(roomId, (counts.get(roomId) ?? 0) + 1);
  };
  add(selfRoomId);
  for (const player of players) add(player.roomId);
  return counts;
}

/** People in one room, the local person included (e.g. "2 personas dentro"). */
export function peopleInRoom(
  state: Pick<WorldState, 'players' | 'localPlayer'>,
  roomId: string,
): number {
  let count = state.localPlayer?.roomId === roomId ? 1 : 0;
  for (const player of state.players.values()) if (player.roomId === roomId) count++;
  return count;
}

/** Sorted ids of the occupied rooms, joined: a cheap key to redraw only on changes. */
export function occupiedKey(occupancy: ReadonlyMap<string, number>): string {
  return [...occupancy.keys()].sort().join('|');
}
