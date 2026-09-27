import { describe, expect, it } from 'vitest';

import { loggedUrl } from '../logger.js';

describe('request URLs in the logs', () => {
  it('drop the query string and redact invite tokens', () => {
    expect(loggedUrl('/api/auth/google/callback?code=4/0secret&state=abc')).toBe(
      '/api/auth/google/callback',
    );
    expect(loggedUrl('/api/join/tok_abcdefghijklmnopqrstuvwxyz0123')).toBe('/api/join/[redacted]');
    expect(loggedUrl('/api/spaces/cmabc123')).toBe('/api/spaces/cmabc123');
    expect(loggedUrl(undefined)).toBeUndefined();
  });
});
