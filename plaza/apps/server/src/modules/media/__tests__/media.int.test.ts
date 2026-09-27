import {
  API_PATHS,
  apiPath,
  CLIENT_HEADER,
  ErrorResponseSchema,
  MediaTokenResponseSchema,
} from '@plaza/shared';
import { TokenVerifier } from 'livekit-server-sdk';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { LiveKitMediaProvider } from '../../../adapters/livekit.js';
import { buildTestApp, type TestApp } from '../../../test/app.js';
import { testConfig } from '../../../test/config.js';
import { resetDatabase } from '../../../test/db.js';
import { signIn } from '../../../test/session.js';

describe('POST /api/spaces/:spaceId/media-token (E5-S3)', () => {
  let t: TestApp;
  let spaceId: string;
  let memberId: string;
  /** Session cookies of the owner (member) and of someone outside the space. */
  let memberCookie: string;
  let outsiderCookie: string;

  beforeAll(async () => {
    t = await buildTestApp();
  });

  beforeEach(async () => {
    const db = t.container.db;
    await resetDatabase(db);
    t.media.tokens.length = 0;
    const ana = await signIn(t.app, 'ana@acme.com', { displayName: 'Ana' });
    const luis = await signIn(t.app, 'luis@acme.com', { displayName: 'Luis' });
    const space = await db.space.create({
      data: {
        name: 'Oficina Acme',
        slug: 'oficina-acme',
        mapTemplateId: 'office-small@1',
        ownerId: ana.user.id,
        inviteTokenHash: 'hash-acme',
        memberships: { create: { userId: ana.user.id, role: 'OWNER' } },
      },
    });
    spaceId = space.id;
    memberId = ana.user.id;
    memberCookie = ana.cookie;
    outsiderCookie = luis.cookie;
  });

  afterAll(async () => {
    await t.app.close();
  });

  function requestToken(
    app: TestApp['app'],
    options: { spaceId: string; cookie?: string; clientHeader?: boolean },
  ) {
    const headers: Record<string, string> = {};
    if (options.clientHeader !== false) headers[CLIENT_HEADER] = 'test';
    if (options.cookie !== undefined) headers.cookie = options.cookie;
    return app.inject({
      method: 'POST',
      url: apiPath(API_PATHS.mediaToken, { spaceId: options.spaceId }),
      headers,
    });
  }

  it('gives a member a token for space_<spaceId> with identity = userId, valid 10 min', async () => {
    const response = await requestToken(t.app, { spaceId, cookie: memberCookie });

    expect(response.statusCode).toBe(200);
    const body = MediaTokenResponseSchema.parse(response.json());
    expect(body.url).toBe('ws://localhost:7880');
    expect(t.media.tokens).toEqual([
      { roomName: `space_${spaceId}`, identity: memberId, displayName: 'Ana', ttlSeconds: 600 },
    ]);
    expect(body.token).toBe(`fake-token:space_${spaceId}:${memberId}`);
    // The client refreshes the token before it expires (security follow-up of E4).
    expect(body.expiresInSeconds).toBe(600);
  });

  it('answers 404 to someone who is not a member of the space', async () => {
    const response = await requestToken(t.app, { spaceId, cookie: outsiderCookie });

    expect(response.statusCode).toBe(404);
    expect(ErrorResponseSchema.parse(response.json()).error.code).toBe('NOT_A_MEMBER');
    expect(t.media.tokens).toEqual([]);
  });

  it('answers 404 for a space that does not exist', async () => {
    const response = await requestToken(t.app, { spaceId: 'no-such-space', cookie: memberCookie });
    expect(response.statusCode).toBe(404);
  });

  it('requires a session (401) and the X-Plaza-Client header (403)', async () => {
    const anonymous = await requestToken(t.app, { spaceId });
    expect(anonymous.statusCode).toBe(401);
    expect(ErrorResponseSchema.parse(anonymous.json()).error.code).toBe('UNAUTHORIZED');

    const noHeader = await requestToken(t.app, {
      spaceId,
      cookie: memberCookie,
      clientHeader: false,
    });
    expect(noHeader.statusCode).toBe(403);
    expect(t.media.tokens).toEqual([]);
  });

  describe('with the real LiveKit adapter', () => {
    let real: TestApp;

    beforeAll(async () => {
      const { livekit } = testConfig();
      real = await buildTestApp({
        overrides: { media: new LiveKitMediaProvider(livekit) },
      });
    });

    afterAll(async () => {
      await real.app.close();
    });

    it('returns a LiveKit JWT for the space room without admin grants', async () => {
      const response = await requestToken(real.app, { spaceId, cookie: memberCookie });

      expect(response.statusCode).toBe(200);
      const { url, token } = MediaTokenResponseSchema.parse(response.json());
      expect(url).toBe('ws://localhost:7880');
      const { livekit } = testConfig();
      const claims = await new TokenVerifier(livekit.apiKey, livekit.apiSecret).verify(token);
      expect(claims.sub).toBe(memberId);
      expect(claims.name).toBe('Ana');
      expect(claims.exp! - claims.nbf!).toBe(600);
      expect(claims.video).toMatchObject({
        room: `space_${spaceId}`,
        roomJoin: true,
        canPublish: true,
        canSubscribe: true,
        roomAdmin: false,
        roomCreate: false,
        roomList: false,
        roomRecord: false,
      });
    });
  });
});
