import { describe, expect, it } from 'vitest';

import { isWalkable, parseMap, roomAt, type WorldMap } from '../map.js';
import { NotImplementedError } from '../not-implemented.js';

// Placeholder contract of the functions owned by later stories.
// Delete each case when the corresponding story implements the function.
const emptyMap: WorldMap = {
  width: 1,
  height: 1,
  collisionGrid: new Uint8Array(1),
  rooms: [],
  spawns: [],
  desks: [],
};

describe('world stubs', () => {
  it.each([
    ['parseMap (E3-S1)', () => parseMap({})],
    ['isWalkable (E3-S1)', () => isWalkable(emptyMap, 0, 0)],
    ['roomAt (E3-S1)', () => roomAt(emptyMap, 0, 0)],
  ])('%s throws NotImplementedError until implemented', (_name, call) => {
    expect(call).toThrow(NotImplementedError);
  });
});
