import { describe, expect, it } from 'vitest';

import { REDACTED, scrubBreadcrumb, scrubEvent, scrubString } from '../scrub.js';

const JWT =
  'eyJhbGciOiJSUzI1NiIsImtpZCI6IjEifQ.eyJzdWIiOiIxMjM0NSIsImVtYWlsIjoiYUBiLmNvbSJ9.c2lnbmF0dXJl';

describe('scrubString', () => {
  it('redacts tokens recognised by their shape', () => {
    expect(scrubString(`id_token ${JWT} rejected`)).toBe(`id_token ${REDACTED} rejected`);
    expect(scrubString('Authorization: Bearer ya29.a0AfH6SMBx-abc_def')).toBe(
      `Authorization: Bearer ${REDACTED}`,
    );
    expect(scrubString('token ya29.a0AfH6SMBx-abc_def expired')).toBe(`token ${REDACTED} expired`);
    expect(scrubString('refresh 1//0gAbCdEfGhIjKlMn')).toBe(`refresh ${REDACTED}`);
    expect(scrubString('code 4/0AX4XfWjAbCdEfGhIj')).toBe(`code ${REDACTED}`);
    expect(scrubString('cookie: bululu_sid=abc123def; other=1')).toBe(
      `cookie: bululu_sid=${REDACTED}; other=1`,
    );
  });

  it('redacts OAuth and token query parameters, invite links and e-mails', () => {
    expect(
      scrubString(
        'https://bululu.example.com/api/auth/google/callback?state=s1&code=c2&scope=openid',
      ),
    ).toBe(
      `https://bululu.example.com/api/auth/google/callback?state=${REDACTED}&code=${REDACTED}&scope=openid`,
    );
    expect(scrubString('/join/AbCdEfGhIjKlMnOpQrStUvWxYz0123456789_-abc')).toBe(
      `/join/${REDACTED}`,
    );
    expect(scrubString('user ana.lopez+x@acme.co.uk not found')).toBe('user [email] not found');
  });

  it('keeps ordinary text, ids and package paths', () => {
    const text =
      'Unknown desk "desk-03" in space c1a2b3 at node_modules/.pnpm/engine.io@6.6.11/x.js';
    expect(scrubString(text)).toBe(text);
  });
});

describe('scrubEvent', () => {
  it('never lets a chat body, a token or a cookie through, and keeps userId, spaceId and release', () => {
    const event = {
      release: 'bululu-server@0.1.0',
      message: `Failed to verify ${JWT}`,
      user: { id: 'u1', email: 'ana@acme.com', ip_address: '1.2.3.4', username: 'ana' },
      tags: { spaceId: 's1', event: 'chat:send' },
      request: {
        url: 'https://bululu.example.com/api/auth/google/callback?code=4/0AX4XfWjAbCdEfGhIj&state=x',
        method: 'POST',
        data: { body: 'hola equipo' },
        cookies: { bululu_sid: 'secret-session' },
        headers: { Cookie: 'bululu_sid=abc', Authorization: 'Bearer abc', 'user-agent': 'UA' },
      },
      extra: {
        payload: { v: 1, body: 'mensaje privado' },
        livekit: { token: 'lk-token', apiSecret: 'shh' },
      },
      exception: {
        values: [
          {
            type: 'Error',
            value: 'boom',
            stacktrace: { frames: [{ filename: 'chat.ts', vars: { body: 'hola' } }] },
          },
        ],
      },
    };

    const scrubbed = scrubEvent(event);
    const json = JSON.stringify(scrubbed);

    for (const secret of [
      'hola equipo',
      'mensaje privado',
      'secret-session',
      'lk-token',
      'shh',
      'ana@acme.com',
      '1.2.3.4',
      '4/0AX4',
      JWT,
    ]) {
      expect(json).not.toContain(secret);
    }
    expect(scrubbed.user).toEqual({ id: 'u1' });
    expect(scrubbed.tags).toEqual({ spaceId: 's1', event: 'chat:send' });
    expect(scrubbed.release).toBe('bululu-server@0.1.0');
    expect(scrubbed.request).toEqual({
      url: `https://bululu.example.com/api/auth/google/callback?code=${REDACTED}&state=${REDACTED}`,
      method: 'POST',
      headers: { Cookie: REDACTED, Authorization: REDACTED, 'user-agent': 'UA' },
    });
    expect(scrubbed.exception.values[0]?.value).toBe('boom');
    // The input is not modified.
    expect(event.request.data.body).toBe('hola equipo');
  });

  it('handles users without id, cycles, deep values and non-objects', () => {
    const cyclic: Record<string, unknown> = { name: 'a' };
    cyclic.self = cyclic;
    let deep: Record<string, unknown> = { leaf: 'x' };
    for (let i = 0; i < 20; i++) deep = { deep };

    expect(scrubEvent({ user: { email: 'a@b.com' } }).user).toEqual({});
    expect(scrubEvent(cyclic)).toEqual({ name: 'a', self: REDACTED });
    expect(JSON.stringify(scrubEvent(deep))).toContain(REDACTED);
    expect(scrubEvent('ya29.token')).toBe(REDACTED);
    expect(scrubEvent(42)).toBe(42);
    expect(scrubEvent(null)).toBeNull();
    expect(scrubEvent({ user: null, request: null })).toEqual({ user: null, request: null });
  });
});

describe('scrubBreadcrumb', () => {
  it('drops console breadcrumbs and scrubs URLs of the others', () => {
    expect(scrubBreadcrumb({ category: 'console', message: 'chat: hola' })).toBeNull();
    expect(
      scrubBreadcrumb({
        category: 'navigation',
        data: { from: '/spaces', to: '/join/AbCdEfGhIjKlMnOpQrStUvWx' },
      }),
    ).toEqual({ category: 'navigation', data: { from: '/spaces', to: `/join/${REDACTED}` } });
    expect(scrubBreadcrumb({ message: 'no category' })).toEqual({ message: 'no category' });
  });
});
