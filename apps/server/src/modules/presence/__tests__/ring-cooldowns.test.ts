import { RING_COOLDOWN_MS } from '@bululu/shared';
import { describe, expect, it } from 'vitest';

import { RingCooldowns } from '../ring-cooldowns.js';

describe('RingCooldowns (RN-11)', () => {
  it('lets a caller ring the same person once every 30 s and says how long to wait', () => {
    const cooldowns = new RingCooldowns();

    expect(cooldowns.tryRing('s1', 'sam', 'mary', 0)).toBe(0);
    expect(cooldowns.tryRing('s1', 'sam', 'mary', 10_000)).toBe(RING_COOLDOWN_MS - 10_000);
    expect(cooldowns.tryRing('s1', 'sam', 'mary', RING_COOLDOWN_MS)).toBe(0);
  });

  it('keeps pairs and spaces apart', () => {
    const cooldowns = new RingCooldowns();
    cooldowns.tryRing('s1', 'sam', 'mary', 0);

    expect(cooldowns.tryRing('s1', 'sam', 'luis', 1)).toBe(0);
    expect(cooldowns.tryRing('s1', 'mary', 'sam', 1)).toBe(0);
    expect(cooldowns.tryRing('s2', 'sam', 'mary', 1)).toBe(0);
  });

  it('forgets expired rings', () => {
    const cooldowns = new RingCooldowns(1000);
    cooldowns.tryRing('s1', 'a', 'b', 0);
    cooldowns.tryRing('s1', 'a', 'c', 500);

    cooldowns.tryRing('s1', 'x', 'y', 1200);

    expect(cooldowns.size).toBe(2); // a→b expired; a→c and x→y remain
  });
});
