import { describe, expect, it } from 'vitest';

import { effectivePresence } from '../presence.js';

describe('effectivePresence', () => {
  it('shows the chosen status while the person is here', () => {
    expect(effectivePresence({ status: 'available', away: false })).toBe('available');
    expect(effectivePresence({ status: 'busy', away: false })).toBe('busy');
  });

  it('shows away over any chosen status', () => {
    expect(effectivePresence({ status: 'available', away: true })).toBe('away');
    expect(effectivePresence({ status: 'busy', away: true })).toBe('away');
  });
});
