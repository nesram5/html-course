import { createHash } from 'node:crypto';

import {
  API_PATHS,
  CLIENT_HEADER,
  SESSION_COOKIE_NAME,
  SESSION_TTL_MS,
  type ErrorResponse,
} from '@bululu/shared';
import type { LightMyRequestResponse } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { buildTestApp, type TestApp } from '../../../test/app.js';
import { resetDatabase } from '../../../test/db.js';
import { signIn } from '../../../test/session.js';
import { LOGIN_FLOW_COOKIE } from '../auth.routes.js';

const PUBLIC_URL = 'http://localhost:5173';
const DAY_MS = 24 * 60 * 60 * 1000;

function cookieOf(response: LightMyRequestResponse, name: string) {
  return response.cookies.find((cookie) => cookie.name === name);
}

describe('auth module (E1-S1, E1-S2)', () => {
  let testApp: TestApp;
  let now: Date;

  beforeAll(async () => {
    testApp = await buildTestApp({ overrides: { now: () => now } });
  });

  afterAll(async () => {
    await testApp.app.close();
  });

  beforeEach(async () => {
    now = new Date('2026-09-01T10:00:00Z');
    await resetDatabase(testApp.container.db);
    vi.restoreAllMocks();
  });

  /** Starts the Google sign-in and returns the flow cookie and the `state` sent to Google. */
  async function startLogin(next?: string) {
    const response = await testApp.app.inject({
      method: 'GET',
      url: API_PATHS.authGoogle,
      query: next === undefined ? {} : { next },
    });
    const location = new URL(response.headers.location ?? '');
    const flow = cookieOf(response, LOGIN_FLOW_COOKIE);
    return {
      response,
      location,
      state: location.searchParams.get('state') ?? '',
      flowCookie: `${LOGIN_FLOW_COOKIE}=${flow?.value ?? ''}`,
    };
  }

  function callback(query: Record<string, string>, cookie?: string) {
    return testApp.app.inject({
      method: 'GET',
      url: API_PATHS.authGoogleCallback,
      query,
      ...(cookie !== undefined && { headers: { cookie } }),
    });
  }

  function me(cookie: string) {
    return testApp.app.inject({ method: 'GET', url: API_PATHS.me, headers: { cookie } });
  }

  describe('Google sign-in', () => {
    it('redirects to Google with PKCE (S256), state and the OpenID scopes', async () => {
      const { response, location, flowCookie } = await startLogin('/s/acme');

      expect(response.statusCode).toBe(302);
      expect(location.searchParams.get('code_challenge_method')).toBe('S256');
      expect(location.searchParams.get('code_challenge')).toMatch(/^[\w-]{43}$/);
      expect(location.searchParams.get('state')).toMatch(/^[\w-]{43}$/);
      expect(location.searchParams.get('scope')).toBe('openid email profile');
      expect(location.searchParams.get('redirect_uri')).toBe(
        `${PUBLIC_URL}/api/auth/google/callback`,
      );
      const flow = cookieOf(response, LOGIN_FLOW_COOKIE);
      expect(flow).toMatchObject({ httpOnly: true, secure: true, sameSite: 'Lax' });
      expect(flowCookie).not.toContain(location.searchParams.get('state'));
    });

    it('comes back with a __Host-bululu_sid cookie (HttpOnly, Secure, SameSite=Lax) to the original next', async () => {
      testApp.identity.willAuthenticate('good-code', {
        sub: 'google-sub-ana',
        email: 'ana@acme.com',
        name: 'Ana García',
      });
      const { state, flowCookie, location } = await startLogin('/s/acme');

      const response = await callback({ code: 'good-code', state }, flowCookie);

      expect(response.statusCode).toBe(302);
      expect(response.headers.location).toBe(`${PUBLIC_URL}/s/acme`);
      const session = cookieOf(response, SESSION_COOKIE_NAME);
      expect(session).toMatchObject({
        httpOnly: true,
        secure: true,
        sameSite: 'Lax',
        path: '/',
        maxAge: SESSION_TTL_MS / 1000,
      });
      expect(session?.name.startsWith('__Host-')).toBe(true);
      expect(session?.domain).toBeUndefined();
      // PKCE: the verifier sent to Google hashes to the challenge of the redirect.
      const verifier = testApp.identity.exchanges.at(-1)?.codeVerifier ?? '';
      expect(createHash('sha256').update(verifier).digest('base64url')).toBe(
        location.searchParams.get('code_challenge'),
      );
      const meResponse = await me(`${SESSION_COOKIE_NAME}=${session?.value ?? ''}`);
      expect(meResponse.json()).toMatchObject({
        user: { email: 'ana@acme.com', displayName: 'Ana García', avatarChosen: false },
      });
    });

    it('defaults next to /spaces and ignores open redirects', async () => {
      testApp.identity.willAuthenticate('code', { email: 'ana@acme.com' });
      const { state, flowCookie } = await startLogin('//evil.example.com');

      const response = await callback({ code: 'code', state }, flowCookie);

      expect(response.headers.location).toBe(`${PUBLIC_URL}/spaces`);
    });

    it.each(['/\n/evil.example.com', '/\t/evil.example.com', '/s/acme\r\nSet-Cookie: x=1'])(
      'ignores a next path with control characters (%j) instead of failing',
      async (next) => {
        testApp.identity.willAuthenticate('code', { email: 'ana@acme.com' });
        const { state, flowCookie } = await startLogin(next);

        const response = await callback({ code: 'code', state }, flowCookie);

        expect(response.statusCode).toBe(302);
        expect(response.headers.location).toBe(`${PUBLIC_URL}/spaces`);
      },
    );

    it('keeps one user per Google subject and updates the e-mail (E1-S1)', async () => {
      testApp.identity.willAuthenticate('first', {
        sub: 'sub-1',
        email: 'ana@old.com',
        name: 'Ana',
      });
      testApp.identity.willAuthenticate('second', {
        sub: 'sub-1',
        email: 'ana@new.com',
        name: 'Ana Renamed At Google',
      });
      const first = await startLogin();
      const firstResponse = await callback({ code: 'first', state: first.state }, first.flowCookie);
      const cookie = `${SESSION_COOKIE_NAME}=${cookieOf(firstResponse, SESSION_COOKIE_NAME)?.value ?? ''}`;
      await testApp.app.inject({
        method: 'PATCH',
        url: API_PATHS.me,
        headers: { cookie, [CLIENT_HEADER]: 'test' },
        payload: { displayName: 'Ani' },
      });

      const second = await startLogin();
      await callback({ code: 'second', state: second.state }, second.flowCookie);

      const users = await testApp.container.db.user.findMany();
      expect(users).toHaveLength(1);
      expect(users[0]).toMatchObject({
        googleSub: 'sub-1',
        email: 'ana@new.com',
        displayName: 'Ani',
      });
    });

    it('stores the Workspace domain (hd claim) of every sign-in, and clears it when it goes', async () => {
      testApp.identity.willAuthenticate('workspace', {
        sub: 'sub-hd',
        email: 'ana@acme.com',
        hostedDomain: 'ACME.com',
      });
      testApp.identity.willAuthenticate('personal', { sub: 'sub-hd', email: 'ana@acme.com' });

      const first = await startLogin();
      await callback({ code: 'workspace', state: first.state }, first.flowCookie);
      const workspace = await testApp.container.db.user.findFirstOrThrow();
      const second = await startLogin();
      await callback({ code: 'personal', state: second.state }, second.flowCookie);
      const personal = await testApp.container.db.user.findFirstOrThrow();

      expect(workspace.hostedDomain).toBe('acme.com');
      expect(personal.hostedDomain).toBeNull();
    });

    it('stores no Google token: only the subject, e-mail, name and the hash of the session token', async () => {
      testApp.identity.willAuthenticate('code', { sub: 'sub-9', email: 'bob@acme.com' });
      const { state, flowCookie } = await startLogin();

      const response = await callback({ code: 'code', state }, flowCookie);

      const token = cookieOf(response, SESSION_COOKIE_NAME)?.value ?? '';
      const sessions = await testApp.container.db.session.findMany();
      expect(sessions).toHaveLength(1);
      expect(sessions[0]?.id).toBe(createHash('sha256').update(token).digest('hex'));
      expect(sessions[0]?.id).not.toBe(token);
      const user = await testApp.container.db.user.findFirstOrThrow();
      expect(Object.keys(user).sort()).toEqual([
        'avatarChosenAt',
        'avatarId',
        'createdAt',
        'displayName',
        'email',
        'googleSub',
        'hostedDomain',
        'id',
        'pictureUrl',
      ]);
    });

    it('rejects an altered state with 401 and logs it', async () => {
      testApp.identity.willAuthenticate('code', { email: 'ana@acme.com' });
      const warn = vi.spyOn(testApp.container.logger, 'warn');
      const exchangesBefore = testApp.identity.exchanges.length;
      const { flowCookie } = await startLogin();

      const response = await callback({ code: 'code', state: 'tampered-state' }, flowCookie);

      expect(response.statusCode).toBe(401);
      expect(response.json<ErrorResponse>().error.code).toBe('OAUTH_FAILED');
      expect(cookieOf(response, SESSION_COOKIE_NAME)).toBeUndefined();
      expect(warn).toHaveBeenCalledWith(
        expect.objectContaining({ reason: expect.stringContaining('state') as unknown }),
        'Google sign-in rejected',
      );
      expect(testApp.identity.exchanges).toHaveLength(exchangesBefore);
    });

    it('rejects a callback without the flow cookie with 401', async () => {
      const { state } = await startLogin();

      const response = await callback({ code: 'code', state });

      expect(response.statusCode).toBe(401);
    });

    it('rejects a forged (unsigned) flow cookie with 401', async () => {
      const forged = Buffer.from(
        JSON.stringify({ next: '/spaces', state: 'x'.repeat(43), verifier: 'y'.repeat(43) }),
      ).toString('base64url');

      const response = await callback(
        { code: 'code', state: 'x'.repeat(43) },
        `${LOGIN_FLOW_COOKIE}=${forged}`,
      );

      expect(response.statusCode).toBe(401);
    });

    it('rejects an id_token with a wrong audience, issuer or expiry with 401 and logs it', async () => {
      // The fake provider fails like the Google adapter does when the id_token check fails
      // (the adapter test covers audience, issuer and expiry against a signed token).
      const warn = vi.spyOn(testApp.container.logger, 'warn');
      const { state, flowCookie } = await startLogin();

      const response = await callback({ code: 'unknown-code', state }, flowCookie);

      expect(response.statusCode).toBe(401);
      expect(response.json<ErrorResponse>().error.code).toBe('OAUTH_FAILED');
      expect(warn).toHaveBeenCalledWith(
        { reason: 'id_token verification failed' },
        'Google sign-in rejected',
      );
      expect(await testApp.container.db.user.count()).toBe(0);
    });

    it('refuses Google accounts whose e-mail is not verified', async () => {
      testApp.identity.willAuthenticate('code', { email: 'eve@acme.com', emailVerified: false });
      const { state, flowCookie } = await startLogin();

      const response = await callback({ code: 'code', state }, flowCookie);

      expect(response.statusCode).toBe(401);
      expect(await testApp.container.db.user.count()).toBe(0);
    });

    it('sends the person back to the login page when they cancel on Google', async () => {
      const { flowCookie } = await startLogin('/join/abc');

      const response = await callback({ error: 'access_denied' }, flowCookie);

      expect(response.statusCode).toBe(302);
      const location = new URL(response.headers.location ?? '');
      expect(location.pathname).toBe('/login');
      expect(location.searchParams.get('error')).toBe('cancelled');
      expect(location.searchParams.get('next')).toBe('/join/abc');
    });

    it('reports other Google errors as failed', async () => {
      const { flowCookie } = await startLogin();

      const response = await callback({ error: 'server_error' }, flowCookie);

      expect(new URL(response.headers.location ?? '').searchParams.get('error')).toBe('failed');
    });
  });

  describe('sessions', () => {
    it('answers 401 without a session cookie', async () => {
      const response = await testApp.app.inject({ method: 'GET', url: API_PATHS.me });

      expect(response.statusCode).toBe(401);
      expect(response.json<ErrorResponse>().error.code).toBe('UNAUTHORIZED');
    });

    it('logs out with 204 and the old cookie gets 401', async () => {
      const ana = await signIn(testApp.app, 'ana@acme.com');

      const logout = await testApp.app.inject({
        method: 'POST',
        url: API_PATHS.authLogout,
        headers: ana.headers,
      });

      expect(logout.statusCode).toBe(204);
      expect(cookieOf(logout, SESSION_COOKIE_NAME)?.value).toBe('');
      expect((await me(ana.cookie)).statusCode).toBe(401);
      expect(await testApp.container.db.session.count()).toBe(0);
    });

    it('slides the expiry on use and expires after 30 days without use', async () => {
      const ana = await signIn(testApp.app, 'ana@acme.com');

      now = new Date(now.getTime() + 20 * DAY_MS);
      const used = await me(ana.cookie);
      expect(used.statusCode).toBe(200);
      expect(cookieOf(used, SESSION_COOKIE_NAME)?.maxAge).toBe(SESSION_TTL_MS / 1000);
      const session = await testApp.container.db.session.findFirstOrThrow();
      expect(session.expiresAt.getTime()).toBe(now.getTime() + SESSION_TTL_MS);

      now = new Date(now.getTime() + 25 * DAY_MS);
      expect((await me(ana.cookie)).statusCode).toBe(200);

      now = new Date(now.getTime() + 31 * DAY_MS);
      expect((await me(ana.cookie)).statusCode).toBe(401);
      expect(await testApp.container.db.session.count()).toBe(0);
    });

    it('does not rewrite the expiry on every request', async () => {
      const ana = await signIn(testApp.app, 'ana@acme.com');
      const before = await testApp.container.db.session.findFirstOrThrow();

      now = new Date(now.getTime() + 60_000);
      const response = await me(ana.cookie);

      expect(cookieOf(response, SESSION_COOKIE_NAME)).toBeUndefined();
      const after = await testApp.container.db.session.findFirstOrThrow();
      expect(after.expiresAt).toEqual(before.expiresAt);
    });

    it('deletes the sessions of a deleted user in cascade (E1-S1)', async () => {
      const ana = await signIn(testApp.app, 'ana@acme.com');
      await signIn(testApp.app, 'ana@acme.com');
      expect(await testApp.container.db.session.count()).toBe(2);

      await testApp.container.db.user.delete({ where: { id: ana.user.id } });

      expect(await testApp.container.db.session.count()).toBe(0);
    });
  });

  describe('test login', () => {
    it('creates a test session and uses the Google-like display name', async () => {
      const response = await testApp.app.inject({
        method: 'POST',
        url: API_PATHS.authTestLogin,
        headers: { [CLIENT_HEADER]: 'test' },
        payload: { email: 'Luis@Acme.com', displayName: 'Luis' },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        user: { email: 'luis@acme.com', displayName: 'Luis', avatarChosen: false },
      });
      expect(cookieOf(response, SESSION_COOKIE_NAME)?.httpOnly).toBe(true);
    });

    it('requires the X-Bululu-Client header', async () => {
      const response = await testApp.app.inject({
        method: 'POST',
        url: API_PATHS.authTestLogin,
        payload: { email: 'luis@acme.com' },
      });

      expect(response.statusCode).toBe(403);
    });
  });
});

describe('test login disabled', () => {
  it('does not expose the route when AUTH_TEST_LOGIN=false', async () => {
    const testApp = await buildTestApp({ env: { AUTH_TEST_LOGIN: 'false' } });

    const response = await testApp.app.inject({
      method: 'POST',
      url: API_PATHS.authTestLogin,
      headers: { [CLIENT_HEADER]: 'test' },
      payload: { email: 'luis@acme.com' },
    });

    expect(response.statusCode).toBe(404);
    await testApp.app.close();
  });
});
