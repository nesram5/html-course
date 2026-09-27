import { describe, expect, it } from 'vitest';

import { messageTime } from '../lib/message-time';

describe('chat message times', () => {
  const now = new Date(2026, 8, 27, 12, 0);

  it('shows only the time today, "ayer" yesterday and the day before that', () => {
    const yesterday = (time: string) => `ayer ${time}`;
    expect(messageTime(new Date(2026, 8, 27, 10, 15), yesterday, now)).toBe('10:15');
    expect(messageTime(new Date(2026, 8, 26, 10, 15), yesterday, now)).toBe('ayer 10:15');
    expect(messageTime(new Date(2026, 8, 3, 10, 15), yesterday, now)).toMatch(/^3 sept\.? 10:15$/);
  });
});
