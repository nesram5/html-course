import {
  API_PATHS,
  AvatarsResponseSchema,
  MeResponseSchema,
  type ErrorResponse,
} from '@plaza/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { buildTestApp, type TestApp } from '../../../test/app.js';
import { resetDatabase } from '../../../test/db.js';
import { signIn, type TestUser } from '../../../test/session.js';

describe('users module (E1-S4)', () => {
  let testApp: TestApp;
  let ana: TestUser;

  beforeAll(async () => {
    testApp = await buildTestApp();
  });

  afterAll(async () => {
    await testApp.app.close();
  });

  beforeEach(async () => {
    await resetDatabase(testApp.container.db);
    ana = await signIn(testApp.app, 'ana@acme.com', { displayName: 'Ana' });
  });

  function patchMe(payload: Record<string, unknown>) {
    return testApp.app.inject({
      method: 'PATCH',
      url: API_PATHS.me,
      headers: ana.headers,
      payload,
    });
  }

  it('returns my user', async () => {
    const response = await testApp.app.inject({
      method: 'GET',
      url: API_PATHS.me,
      headers: { cookie: ana.cookie },
    });

    expect(response.statusCode).toBe(200);
    expect(MeResponseSchema.parse(response.json()).user).toEqual({
      id: ana.user.id,
      email: 'ana@acme.com',
      displayName: 'Ana',
      avatarId: 'avatar-01',
      avatarChosen: false,
      pictureUrl: null,
      isAdmin: false,
    });
  });

  it('keeps the chosen avatar and display name after reloading', async () => {
    const response = await patchMe({ displayName: '  Ana G.  ', avatarId: 'avatar-05' });

    expect(response.statusCode).toBe(200);
    const reloaded = await testApp.app.inject({
      method: 'GET',
      url: API_PATHS.me,
      headers: { cookie: ana.cookie },
    });
    expect(reloaded.json()).toMatchObject({
      user: { displayName: 'Ana G.', avatarId: 'avatar-05', avatarChosen: true },
    });
  });

  it('changing only the name does not mark the avatar as chosen', async () => {
    const response = await patchMe({ displayName: 'Ana María' });

    expect(response.json()).toMatchObject({
      user: { displayName: 'Ana María', avatarChosen: false },
    });
  });

  it('rejects an unknown avatarId with 400 UNKNOWN_AVATAR', async () => {
    const response = await patchMe({ avatarId: 'avatar-99' });

    expect(response.statusCode).toBe(400);
    expect(response.json<ErrorResponse>().error.code).toBe('UNKNOWN_AVATAR');
  });

  it('rejects an empty update and invalid names with 400', async () => {
    expect((await patchMe({})).statusCode).toBe(400);
    expect((await patchMe({ displayName: '   ' })).statusCode).toBe(400);
    expect((await patchMe({ displayName: 'x'.repeat(41) })).statusCode).toBe(400);
  });

  it('requires a session to update the profile', async () => {
    const response = await testApp.app.inject({
      method: 'PATCH',
      url: API_PATHS.me,
      headers: { 'x-plaza-client': 'test' },
      payload: { displayName: 'Hacker' },
    });

    expect(response.statusCode).toBe(401);
  });

  it('lists the avatar catalog of @plaza/maps (at least 8 walking sprites)', async () => {
    const response = await testApp.app.inject({ method: 'GET', url: API_PATHS.avatars });

    const { avatars } = AvatarsResponseSchema.parse(response.json());
    expect(avatars.length).toBeGreaterThanOrEqual(8);
    expect(avatars[0]).toEqual({
      id: 'avatar-01',
      name: 'Coral',
      spriteUrl: '/assets/maps/avatars/avatar-01.png',
      frameWidth: 32,
      frameHeight: 32,
    });
    // Every sprite sheet of the generated catalog is served: 3 frames × 4 directions.
    for (const avatar of avatars) {
      const sprite = await testApp.app.inject({ method: 'GET', url: avatar.spriteUrl });
      expect(sprite.statusCode, avatar.spriteUrl).toBe(200);
      expect(sprite.headers['content-type']).toBe('image/png');
      expect(sprite.rawPayload.readUInt32BE(16)).toBe(avatar.frameWidth * 3);
      expect(sprite.rawPayload.readUInt32BE(20)).toBe(avatar.frameHeight * 4);
    }
  });
});
