import { describe, expect, it } from 'vitest';

import { computePeers } from '../proximity.js';
import type { WorldMap } from '../map.js';
import { validateStep } from '../movement.js';
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
    ['validateStep (E4-S3)', () => validateStep(emptyMap, { x: 0, y: 0 }, { x: 0, y: 1 })],
    ['computePeers (E5-S1)', () => computePeers([], new Map())],
  ])('%s throws NotImplementedError until implemented', (_name, call) => {
    expect(call).toThrow(NotImplementedError);
  });
});
