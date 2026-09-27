import type { IncomingMessage } from 'node:http';

import { describe, expect, it } from 'vitest';

import { clientIp } from '../client-ip.js';

function request(peer: string, forwardedFor?: string): IncomingMessage {
  return {
    socket: { remoteAddress: peer },
    headers: forwardedFor === undefined ? {} : { 'x-forwarded-for': forwardedFor },
  } as unknown as IncomingMessage;
}

describe('clientIp', () => {
  it('ignores X-Forwarded-For when no proxy is trusted (default)', () => {
    expect(clientIp(request('203.0.113.7', '1.2.3.4'), false)).toBe('203.0.113.7');
    expect(clientIp(request('203.0.113.7', '1.2.3.4'), 0)).toBe('203.0.113.7');
  });

  it('takes the address added by the trusted proxy, not the ones the client sent', () => {
    // Caddy appends the real peer: a client-chosen prefix cannot change the result.
    expect(clientIp(request('172.18.0.3', '198.51.100.9'), 1)).toBe('198.51.100.9');
    expect(clientIp(request('172.18.0.3', '6.6.6.6, 198.51.100.9'), 1)).toBe('198.51.100.9');
    expect(clientIp(request('172.18.0.3', '6.6.6.6,198.51.100.9, 10.0.0.2'), 2)).toBe(
      '198.51.100.9',
    );
  });

  it('falls back to the leftmost address when the header is shorter than the hops', () => {
    expect(clientIp(request('172.18.0.3'), 1)).toBe('172.18.0.3');
    expect(clientIp(request('172.18.0.3', '198.51.100.9'), 3)).toBe('198.51.100.9');
  });
});
