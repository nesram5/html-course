import { describe, expect, it, vi } from 'vitest';

import { GoogleMeetProvider, MEET_SPACES_URL } from '../google-meet.js';

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const ACCESS_TOKEN = 'ya29.meet-access-token';

interface Recorded {
  url: string;
  method: string;
  headers: Headers;
  body: string;
}

function mockGoogle(options: { tokenStatus?: number; meetStatus?: number } = {}) {
  const calls: Recorded[] = [];
  let created = 0;
  const fetchMock = vi.fn((input: string | URL | Request, init?: RequestInit) => {
    const url = input instanceof Request ? input.url : input.toString();
    const body =
      init?.body instanceof URLSearchParams
        ? init.body.toString()
        : typeof init?.body === 'string'
          ? init.body
          : '';
    calls.push({ url, method: init?.method ?? 'GET', headers: new Headers(init?.headers), body });
    const json = (status: number, value: unknown) =>
      Promise.resolve(
        new Response(JSON.stringify(value), {
          status,
          headers: { 'Content-Type': 'application/json' },
        }),
      );
    if (url.startsWith(TOKEN_URL)) {
      return options.tokenStatus !== undefined && options.tokenStatus !== 200
        ? json(options.tokenStatus, { error: 'invalid_grant' })
        : json(200, { access_token: ACCESS_TOKEN, expires_in: 3599, token_type: 'Bearer' });
    }
    if (url === MEET_SPACES_URL) {
      if (options.meetStatus !== undefined && options.meetStatus !== 200) {
        return json(options.meetStatus, { error: { status: 'PERMISSION_DENIED' } });
      }
      created += 1;
      return json(200, {
        name: `spaces/space-${String(created)}`,
        meetingUri: `https://meet.google.com/abc-defg-00${String(created)}`,
        meetingCode: `abc-defg-00${String(created)}`,
        config: { accessType: 'TRUSTED' },
      });
    }
    return json(404, {});
  });
  return { fetch: fetchMock as unknown as typeof fetch, calls };
}

function provider(fetchImpl: typeof fetch) {
  return new GoogleMeetProvider({
    clientId: 'client-id',
    clientSecret: 'secret',
    fetch: fetchImpl,
  });
}

const authorization = {
  code: 'meet-code',
  codeVerifier: 'verifier',
  redirectUri: 'http://localhost:5173/api/auth/google/meet/callback',
};

describe('GoogleMeetProvider (E2-S7)', () => {
  it('asks incrementally for meetings.space.created with PKCE and state', () => {
    const url = new URL(
      provider(mockGoogle().fetch).createAuthorizationUrl({
        state: 'state-1',
        codeChallenge: 'challenge',
        redirectUri: authorization.redirectUri,
        loginHint: 'ana@acme.com',
      }),
    );

    expect(Object.fromEntries(url.searchParams)).toMatchObject({
      scope: 'https://www.googleapis.com/auth/meetings.space.created',
      include_granted_scopes: 'true',
      state: 'state-1',
      code_challenge: 'challenge',
      code_challenge_method: 'S256',
      login_hint: 'ana@acme.com',
    });
  });

  it('creates one TRUSTED Meet space per room with the access token and returns only the links', async () => {
    const google = mockGoogle();

    const spaces = await provider(google.fetch).createMeetingSpaces({ authorization, count: 3 });

    expect(spaces).toEqual([
      { meetingUri: 'https://meet.google.com/abc-defg-001' },
      { meetingUri: 'https://meet.google.com/abc-defg-002' },
      { meetingUri: 'https://meet.google.com/abc-defg-003' },
    ]);
    expect(JSON.stringify(spaces)).not.toContain(ACCESS_TOKEN);
    const tokenCall = google.calls.find((call) => call.url.startsWith(TOKEN_URL));
    expect(new URLSearchParams(tokenCall?.body).get('code_verifier')).toBe('verifier');
    const meetCalls = google.calls.filter((call) => call.url === MEET_SPACES_URL);
    expect(meetCalls).toHaveLength(3);
    for (const call of meetCalls) {
      expect(call.method).toBe('POST');
      expect(call.headers.get('authorization')).toBe(`Bearer ${ACCESS_TOKEN}`);
      expect(JSON.parse(call.body)).toEqual({ config: { accessType: 'TRUSTED' } });
    }
  });

  it('fails with MEETING_PROVIDER_ERROR when consent or the code is rejected', async () => {
    const google = mockGoogle({ tokenStatus: 400 });

    await expect(
      provider(google.fetch).createMeetingSpaces({ authorization, count: 1 }),
    ).rejects.toMatchObject({ code: 'MEETING_PROVIDER_ERROR' });
    expect(google.calls.some((call) => call.url === MEET_SPACES_URL)).toBe(false);
  });

  it('fails with MEETING_PROVIDER_ERROR when the Meet API refuses', async () => {
    const google = mockGoogle({ meetStatus: 403 });

    await expect(
      provider(google.fetch).createMeetingSpaces({ authorization, count: 2 }),
    ).rejects.toMatchObject({ code: 'MEETING_PROVIDER_ERROR' });
  });

  it('fails with MEETING_PROVIDER_ERROR when the network is down', async () => {
    let first = true;
    const fetchImpl = vi.fn((input: string | URL | Request, init?: RequestInit) => {
      if (first) {
        first = false;
        return mockGoogle().fetch(input, init);
      }
      return Promise.reject(new TypeError('fetch failed'));
    }) as unknown as typeof fetch;

    await expect(
      provider(fetchImpl).createMeetingSpaces({ authorization, count: 1 }),
    ).rejects.toMatchObject({ code: 'MEETING_PROVIDER_ERROR' });
  });
});
