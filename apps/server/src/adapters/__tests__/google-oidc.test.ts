import { generateKeyPairSync, sign } from 'node:crypto';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AppError } from '../../platform/errors.js';
import { GoogleIdentityProvider } from '../google-oidc.js';
import { LOGIN_SCOPES } from '../identity-provider.js';

const CLIENT_ID = 'plaza-test.apps.googleusercontent.com';
const KID = 'test-key-1';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const CERTS_URL = 'https://www.googleapis.com/oauth2/v1/certs';

const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const publicPem = publicKey.export({ type: 'spki', format: 'pem' }).toString();

function base64url(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

/** An RS256 id_token signed with the test key (what Google would return). */
function idToken(claims: Record<string, unknown>): string {
  const nowSec = Math.floor(Date.now() / 1000);
  const payload = {
    iss: 'https://accounts.google.com',
    aud: CLIENT_ID,
    sub: '1234567890',
    email: 'Ana@Acme.com',
    email_verified: true,
    name: 'Ana García',
    picture: 'https://lh3.googleusercontent.com/a/photo',
    hd: 'acme.com',
    iat: nowSec,
    exp: nowSec + 3600,
    ...claims,
  };
  const signingInput = `${base64url({ alg: 'RS256', kid: KID, typ: 'JWT' })}.${base64url(payload)}`;
  const signature = sign('RSA-SHA256', Buffer.from(signingInput), privateKey).toString('base64url');
  return `${signingInput}.${signature}`;
}

interface Recorded {
  url: string;
  method: string;
  body: string;
}

/** Mocked Google endpoints: token exchange and the public certificates. */
function mockGoogle(tokenResponse: { status: number; body: unknown }) {
  const calls: Recorded[] = [];
  const fetchMock = vi.fn((input: string | URL | Request, init?: RequestInit) => {
    const url = input instanceof Request ? input.url : input.toString();
    const body =
      init?.body instanceof URLSearchParams
        ? init.body.toString()
        : typeof init?.body === 'string'
          ? init.body
          : '';
    calls.push({ url, method: init?.method ?? 'GET', body });
    if (url.startsWith(TOKEN_URL)) {
      return Promise.resolve(
        new Response(JSON.stringify(tokenResponse.body), {
          status: tokenResponse.status,
          headers: { 'Content-Type': 'application/json' },
        }),
      );
    }
    if (url.startsWith(CERTS_URL)) {
      return Promise.resolve(
        new Response(JSON.stringify({ [KID]: publicPem }), {
          status: 200,
          headers: { 'Content-Type': 'application/json', 'Cache-Control': 'max-age=3600' },
        }),
      );
    }
    return Promise.resolve(new Response('not found', { status: 404 }));
  });
  return { fetch: fetchMock as unknown as typeof fetch, calls };
}

function provider(fetchImpl: typeof fetch) {
  return new GoogleIdentityProvider({
    clientId: CLIENT_ID,
    clientSecret: 'secret',
    fetch: fetchImpl,
  });
}

const exchange = {
  code: 'auth-code',
  codeVerifier: 'verifier-123',
  redirectUri: 'http://localhost:5173/api/auth/google/callback',
};

describe('GoogleIdentityProvider (E1-S2)', () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('builds the consent URL with PKCE S256, state and the OpenID scopes', () => {
    const url = new URL(
      provider(mockGoogle({ status: 200, body: {} }).fetch).createAuthorizationUrl({
        state: 'state-1',
        codeChallenge: 'challenge-1',
        redirectUri: exchange.redirectUri,
        scopes: LOGIN_SCOPES,
      }),
    );

    expect(`${url.origin}${url.pathname}`).toBe('https://accounts.google.com/o/oauth2/v2/auth');
    expect(Object.fromEntries(url.searchParams)).toMatchObject({
      client_id: CLIENT_ID,
      response_type: 'code',
      scope: 'openid email profile',
      state: 'state-1',
      code_challenge: 'challenge-1',
      code_challenge_method: 'S256',
      redirect_uri: exchange.redirectUri,
    });
  });

  it('exchanges the code with the PKCE verifier and returns the verified identity only', async () => {
    const google = mockGoogle({
      status: 200,
      body: { access_token: 'ya29.secret', id_token: idToken({}), expires_in: 3600 },
    });

    const identity = await provider(google.fetch).exchangeCode(exchange);

    expect(identity).toEqual({
      sub: '1234567890',
      email: 'ana@acme.com',
      emailVerified: true,
      name: 'Ana García',
      pictureUrl: 'https://lh3.googleusercontent.com/a/photo',
      hostedDomain: 'acme.com',
    });
    expect(JSON.stringify(identity)).not.toContain('ya29');
    const tokenCall = google.calls.find((call) => call.url.startsWith(TOKEN_URL));
    const form = new URLSearchParams(tokenCall?.body);
    expect(tokenCall?.method).toBe('POST');
    expect(form.get('code')).toBe('auth-code');
    expect(form.get('code_verifier')).toBe('verifier-123');
    expect(form.get('grant_type')).toBe('authorization_code');
    expect(form.get('redirect_uri')).toBe(exchange.redirectUri);
  });

  it.each([
    ['a wrong audience', { aud: 'someone-else.apps.googleusercontent.com' }],
    ['a wrong issuer', { iss: 'https://evil.example.com' }],
    ['an expired token', { iat: 1_600_000_000, exp: 1_600_003_600 }],
  ])('rejects an id_token with %s as OAUTH_FAILED', async (_label, claims) => {
    const google = mockGoogle({ status: 200, body: { id_token: idToken(claims) } });

    const result = provider(google.fetch).exchangeCode(exchange);

    await expect(result).rejects.toBeInstanceOf(AppError);
    await expect(result).rejects.toMatchObject({ code: 'OAUTH_FAILED' });
  });

  it('rejects an id_token signed with another key', async () => {
    const token = idToken({});
    const [header, payload] = token.split('.');
    const other = generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey;
    const forged = `${header ?? ''}.${payload ?? ''}.${sign('RSA-SHA256', Buffer.from(`${header ?? ''}.${payload ?? ''}`), other).toString('base64url')}`;
    const google = mockGoogle({ status: 200, body: { id_token: forged } });

    await expect(provider(google.fetch).exchangeCode(exchange)).rejects.toMatchObject({
      code: 'OAUTH_FAILED',
    });
  });

  it('fails with OAUTH_FAILED when Google rejects the code or returns no id_token', async () => {
    const rejected = mockGoogle({ status: 400, body: { error: 'invalid_grant' } });
    const noIdToken = mockGoogle({ status: 200, body: { access_token: 'x' } });

    await expect(provider(rejected.fetch).exchangeCode(exchange)).rejects.toMatchObject({
      code: 'OAUTH_FAILED',
    });
    await expect(provider(noIdToken.fetch).exchangeCode(exchange)).rejects.toMatchObject({
      code: 'OAUTH_FAILED',
    });
  });

  it('reports unverified e-mails so the auth service can refuse them', async () => {
    const google = mockGoogle({
      status: 200,
      body: { id_token: idToken({ email_verified: false, hd: undefined }) },
    });

    const identity = await provider(google.fetch).exchangeCode(exchange);

    expect(identity).toMatchObject({ emailVerified: false, hostedDomain: null });
  });
});
