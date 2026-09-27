import type { WorldMap } from '@plaza/shared';

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
