import { describe, expect, it } from 'vitest';

import {
  MAX_PEERS,
  PROTOCOL_VERSION,
  PROXIMITY_HYSTERESIS,
  PROXIMITY_RADIUS,
  TICK_HZ,
  TICK_MS,
  TILE_SIZE,
  mediaRoomName,
} from '../constants.js';

describe('constants', () => {
  it('matches the values fixed by the architecture', () => {
    expect(TILE_SIZE).toBe(32);
    expect(PROXIMITY_RADIUS).toBe(3);
    expect(PROXIMITY_HYSTERESIS).toBe(1);
    expect(TICK_HZ).toBe(15);
    expect(TICK_MS).toBe(67);
    expect(MAX_PEERS).toBe(8);
    expect(PROTOCOL_VERSION).toBe(1);
  });

  it('names one LiveKit room per space', () => {
    expect(mediaRoomName('abc')).toBe('space_abc');
  });
});
