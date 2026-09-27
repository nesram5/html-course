import { describe, expect, it } from 'vitest';

import {
  ABOVE_DEPTH,
  BELOW_DEPTH,
  DESK_DECOR_DEPTH,
  DESK_LABEL_DEPTH,
  FADING_ABOVE_DEPTH,
  FADING_BELOW_DEPTH,
  ROOM_DEPTH,
  avatarDepth,
  labelDepth,
} from '../game/sprites/depth';

// Rows of the largest template (campus) and a bit more.
const ROWS = [0, 1, 25, 63, 99];

describe('draw order of the office (architecture §8.1, E5, E7, E9)', () => {
  it('stacks the style art, rooms, desk objects and avatars from the bottom up', () => {
    expect(BELOW_DEPTH).toBeLessThan(FADING_BELOW_DEPTH);
    expect(FADING_BELOW_DEPTH).toBeLessThan(ROOM_DEPTH);
    expect(ROOM_DEPTH).toBeLessThan(DESK_DECOR_DEPTH);
    for (const row of ROWS) {
      expect(DESK_DECOR_DEPTH).toBeLessThan(avatarDepth(row));
      expect(avatarDepth(row)).toBeLessThan(ABOVE_DEPTH);
    }
  });

  it('keeps desk names, avatar names, status dots, 💬 and reactions over any style art', () => {
    // A style fading in (E9-S1) stays under every label while it fades.
    expect(ABOVE_DEPTH).toBeLessThan(FADING_ABOVE_DEPTH);
    expect(FADING_ABOVE_DEPTH).toBeLessThan(DESK_LABEL_DEPTH);
    for (const row of ROWS) {
      // Avatar names (and the dot, 💬 and reaction drawn at the same depth) over desk names.
      expect(DESK_LABEL_DEPTH).toBeLessThan(labelDepth(row));
    }
    // Lower rows in front, among the labels too.
    expect(labelDepth(2)).toBeGreaterThan(labelDepth(1));
  });
});
