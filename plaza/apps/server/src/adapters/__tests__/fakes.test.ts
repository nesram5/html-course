import { MEET_URI_PREFIX } from '@plaza/shared';
import { describe, expect, it } from 'vitest';

import { AppError } from '../../platform/errors.js';
import { FakeIdentityProvider, FakeMediaProvider, FakeMeetingProvider } from '../fakes/index.js';
import { LOGIN_SCOPES } from '../identity-provider.js';

const exchange = { code: 'code-1', codeVerifier: 'verifier', redirectUri: 'http://x/cb' };

describe('FakeIdentityProvider', () => {
  it('builds an authorization URL with state, PKCE challenge and scopes', () => {
    const provider = new FakeIdentityProvider();
    const url = new URL(
      provider.createAuthorizationUrl({
        state: 'st',
        codeChallenge: 'ch',
        redirectUri: 'http://x/cb',
        scopes: LOGIN_SCOPES,
      }),
    );
    expect(url.searchParams.get('state')).toBe('st');
    expect(url.searchParams.get('code_challenge')).toBe('ch');
    expect(url.searchParams.get('scope')).toBe('openid email profile');
  });

  it('resolves registered codes and rejects unknown ones with OAUTH_FAILED', async () => {
    const provider = new FakeIdentityProvider();
    provider.willAuthenticate('code-1', { email: 'ana@acme.com', hostedDomain: 'acme.com' });

    await expect(provider.exchangeCode(exchange)).resolves.toEqual({
      sub: 'fake-ana@acme.com',
      email: 'ana@acme.com',
      emailVerified: true,
      name: 'ana',
      pictureUrl: null,
      hostedDomain: 'acme.com',
    });
    await expect(provider.exchangeCode({ ...exchange, code: 'other' })).rejects.toMatchObject({
      code: 'OAUTH_FAILED',
    });
  });
});

describe('FakeMeetingProvider', () => {
  it('creates distinct Meet links', async () => {
    const provider = new FakeMeetingProvider();
    const spaces = await provider.createMeetingSpaces({ authorization: exchange, count: 3 });
    expect(spaces).toHaveLength(3);
    expect(new Set(spaces.map((s) => s.meetingUri)).size).toBe(3);
    for (const space of spaces) expect(space.meetingUri.startsWith(MEET_URI_PREFIX)).toBe(true);
    expect(
      provider.createAuthorizationUrl({ state: 's', codeChallenge: 'c', redirectUri: 'r' }),
    ).toContain('state=s');
  });

  it('can simulate a provider failure', async () => {
    const provider = new FakeMeetingProvider();
    provider.failWith();
    await expect(
      provider.createMeetingSpaces({ authorization: exchange, count: 1 }),
    ).rejects.toBeInstanceOf(AppError);
  });
});

describe('FakeMediaProvider', () => {
  it('issues tokens and records server-side mutes, publish permissions and removals', async () => {
    const provider = new FakeMediaProvider('ws://lk');
    const token = await provider.createToken({
      roomName: 'space_1',
      identity: 'u1',
      displayName: 'Ana',
      ttlSeconds: 3600,
    });
    await provider.mutePublishedTracks({ roomName: 'space_1', identity: 'u1' });
    await provider.removeParticipant({ roomName: 'space_1', identity: 'u2' });
    await provider.setCanPublish({ roomName: 'space_1', identity: 'u1', canPublish: false });

    expect(provider.url).toBe('ws://lk');
    expect(token).toBe('fake-token:space_1:u1');
    expect(provider.mutes).toEqual([{ roomName: 'space_1', identity: 'u1' }]);
    expect(provider.removals).toEqual([{ roomName: 'space_1', identity: 'u2' }]);
    expect(provider.permissions).toEqual([
      { roomName: 'space_1', identity: 'u1', canPublish: false },
    ]);
  });
});
