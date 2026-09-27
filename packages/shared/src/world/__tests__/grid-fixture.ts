import type { DeskArea, RoomArea, WorldMap } from '../map.js';

/**
 * Builds a small {@link WorldMap} from ASCII rows (`#` blocks, anything else is walkable),
 * without depending on `parseMap`.
 */
export function gridMap(
  rows: readonly string[],
  extra: { rooms?: readonly RoomArea[]; desks?: readonly DeskArea[] } = {},
): WorldMap {
  const height = rows.length;
  const width = rows[0]?.length ?? 0;
  const collisionGrid = new Uint8Array(width * height);
  rows.forEach((row, y) => {
    if (row.length !== width) throw new Error(`row ${String(y)} has a different width`);
    for (let x = 0; x < width; x++) collisionGrid[y * width + x] = row[x] === '#' ? 1 : 0;
  });
  return {
    width,
    height,
    collisionGrid,
    rooms: extra.rooms ?? [],
    spawns: [],
    desks: extra.desks ?? [],
  };
}
