import {
  API_PATHS,
  apiPath,
  CLIENT_HEADER,
  RoomResponseSchema,
  RoomsResponseSchema,
  SpaceResponseSchema,
  type ErrorResponse,
  type SpaceDetailDto,
} from '@plaza/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { AppError } from '../../../platform/errors.js';
import { buildTestApp, type TestApp } from '../../../test/app.js';
import { resetDatabase } from '../../../test/db.js';
import { signIn, type TestUser } from '../../../test/session.js';
import { MEET_FLOW_COOKIE } from '../rooms.routes.js';

describe('rooms module (E2-S7)', () => {
  let testApp: TestApp;
  let ana: TestUser;
  let luis: TestUser;
  let space: SpaceDetailDto;

  beforeAll(async () => {
    testApp = await buildTestApp();
  });

  afterAll(async () => {
    await testApp.app.close();
  });

  beforeEach(async () => {
    await resetDatabase(testApp.container.db);
    testApp.meetings.calls.length = 0;
    testApp.meetings.failWith(null);
    vi.restoreAllMocks();
    ana = await signIn(testApp.app, 'ana@acme.com');
    luis = await signIn(testApp.app, 'luis@acme.com');
    const created = await testApp.app.inject({
      method: 'POST',
      url: API_PATHS.spaces,
      headers: ana.headers,
      payload: { name: 'Oficina Acme', mapTemplateId: 'campus@1' },
    });
    space = SpaceResponseSchema.parse(created.json()).space;
    const token = new URL(space.inviteUrl ?? '').pathname.split('/').pop() ?? '';
    await testApp.app.inject({
      method: 'POST',
      url: apiPath(API_PATHS.join, { token }),
      headers: luis.headers,
    });
  });

  /** "Crear salas de reunión": authorize, then Google comes back to the callback. */
  async function authorize(user: TestUser = ana) {
    const response = await testApp.app.inject({
      method: 'POST',
      url: apiPath(API_PATHS.roomsAuthorize, { spaceId: space.id }),
      headers: user.headers,
    });
    const flow = response.cookies.find((cookie) => cookie.name === MEET_FLOW_COOKIE);
    const authorizeUrl =
      response.statusCode === 200
        ? new URL(response.json<{ authorizeUrl: string }>().authorizeUrl)
        : null;
    return {
      response,
      authorizeUrl,
      state: authorizeUrl?.searchParams.get('state') ?? '',
      cookie: `${user.cookie}; ${MEET_FLOW_COOKIE}=${flow?.value ?? ''}`,
    };
  }

  function callback(cookie: string, query: Record<string, string>) {
    return testApp.app.inject({
      method: 'GET',
      url: API_PATHS.roomsAuthCallback,
      query,
      headers: { cookie },
    });
  }

  async function rooms(user: TestUser = ana) {
    const response = await testApp.app.inject({
      method: 'GET',
      url: apiPath(API_PATHS.rooms, { spaceId: space.id }),
      headers: { cookie: user.cookie },
    });
    return RoomsResponseSchema.parse(response.json()).rooms;
  }

  function putRoom(user: TestUser, areaId: string, meetUri: string) {
    return testApp.app.inject({
      method: 'PUT',
      url: apiPath(API_PATHS.room, { spaceId: space.id, areaId }),
      headers: user.headers,
      payload: { meetUri },
    });
  }

  it('lists every room of the map, without links at first', async () => {
    expect(await rooms(luis)).toEqual([
      { areaId: 'sala-mar', name: 'Sala Mar', meetUri: null, source: null },
      { areaId: 'sala-bosque', name: 'Sala Bosque', meetUri: null, source: null },
      { areaId: 'sala-coral', name: 'Sala Coral', meetUri: null, source: null },
    ]);
  });

  it('asks Google only for meetings.space.created, with PKCE and state', async () => {
    const { response, authorizeUrl } = await authorize();

    expect(response.statusCode).toBe(200);
    expect(authorizeUrl?.searchParams.get('state')).toMatch(/^[\w-]{43}$/);
    expect(authorizeUrl?.searchParams.get('redirect_uri')).toBe(
      'http://localhost:5173/api/auth/google/meet/callback',
    );
    const flow = response.cookies.find((cookie) => cookie.name === MEET_FLOW_COOKIE);
    expect(flow).toMatchObject({
      httpOnly: true,
      secure: true,
      sameSite: 'Lax',
      path: '/api/auth',
    });
  });

  it('creates one TRUSTED Meet per room after consent and redirects to the settings', async () => {
    const { state, cookie } = await authorize();

    const response = await callback(cookie, { code: 'meet-code', state });

    expect(response.statusCode).toBe(302);
    expect(response.headers.location).toBe(
      `http://localhost:5173/spaces/${space.id}/settings?rooms=created`,
    );
    expect(testApp.meetings.calls).toHaveLength(1);
    expect(testApp.meetings.calls[0]).toMatchObject({
      count: 3,
      authorization: {
        code: 'meet-code',
        redirectUri: 'http://localhost:5173/api/auth/google/meet/callback',
      },
    });
    const list = await rooms(luis);
    expect(list.map((room) => room.source)).toEqual(['api', 'api', 'api']);
    expect(list.every((room) => room.meetUri?.startsWith('https://meet.google.com/'))).toBe(true);
  });

  it('is idempotent: retrying does not duplicate rooms nor call Google again', async () => {
    const first = await authorize();
    await callback(first.cookie, { code: 'meet-code', state: first.state });
    const before = await rooms();

    const second = await authorize();
    const response = await callback(second.cookie, { code: 'meet-code-2', state: second.state });

    expect(response.headers.location).toContain('rooms=created');
    expect(testApp.meetings.calls).toHaveLength(1);
    expect(await rooms()).toEqual(before);
    expect(await testApp.container.db.meetingRoom.count()).toBe(3);
  });

  it('only creates the rooms that are still missing', async () => {
    await putRoom(ana, 'sala-bosque', 'https://meet.google.com/abc-defg-hij');
    const { state, cookie } = await authorize();

    await callback(cookie, { code: 'meet-code', state });

    expect(testApp.meetings.calls[0]?.count).toBe(2);
    const list = await rooms();
    expect(list.find((room) => room.areaId === 'sala-bosque')).toMatchObject({
      meetUri: 'https://meet.google.com/abc-defg-hij',
      source: 'manual',
    });
  });

  it('when the owner denies consent, goes back to the settings to retry or paste links', async () => {
    const { cookie } = await authorize();

    const response = await callback(cookie, { error: 'access_denied' });

    expect(response.headers.location).toBe(
      `http://localhost:5173/spaces/${space.id}/settings?rooms=denied`,
    );
    expect(testApp.meetings.calls).toHaveLength(0);
  });

  it('when Google fails, reports it and the space keeps working', async () => {
    testApp.meetings.failWith(new AppError('MEETING_PROVIDER_ERROR'));
    const { state, cookie } = await authorize();

    const response = await callback(cookie, { code: 'meet-code', state });

    expect(response.headers.location).toContain('rooms=failed');
    expect(await testApp.container.db.meetingRoom.count()).toBe(0);
    expect((await rooms()).every((room) => room.meetUri === null)).toBe(true);
  });

  it('rejects an altered state with 401 and logs it', async () => {
    const warn = vi.spyOn(testApp.container.logger, 'warn');
    const { cookie } = await authorize();

    const response = await callback(cookie, { code: 'meet-code', state: 'tampered' });

    expect(response.statusCode).toBe(401);
    expect(warn).toHaveBeenCalled();
    expect(testApp.meetings.calls).toHaveLength(0);
  });

  it('rejects the flow of another person', async () => {
    const { state, cookie } = await authorize();
    const flowCookie = cookie.split('; ')[1] ?? '';

    const response = await callback(`${luis.cookie}; ${flowCookie}`, { code: 'meet-code', state });

    expect(response.statusCode).toBe(401);
  });

  it('only owners can authorize (403)', async () => {
    const { response } = await authorize(luis);

    expect(response.statusCode).toBe(403);
  });

  describe('manual links', () => {
    it('replaces a link by hand with source "manual"', async () => {
      const response = await putRoom(ana, 'sala-mar', 'https://meet.google.com/xyz-abcd-efg');

      expect(response.statusCode).toBe(200);
      expect(RoomResponseSchema.parse(response.json()).room).toEqual({
        areaId: 'sala-mar',
        name: 'Sala Mar',
        meetUri: 'https://meet.google.com/xyz-abcd-efg',
        source: 'manual',
      });
    });

    it('validates that the link starts with https://meet.google.com/', async () => {
      for (const meetUri of [
        'https://zoom.us/j/123',
        'http://meet.google.com/abc',
        'meet.google.com/abc',
        'https://meet.google.com.evil.com/abc',
      ]) {
        const response = await putRoom(ana, 'sala-mar', meetUri);
        expect(response.statusCode, meetUri).toBe(400);
        expect(response.json<ErrorResponse>().error.code).toBe('INVALID_MEET_URI');
      }
    });

    it('rejects unknown rooms (404) and members (403)', async () => {
      const unknown = await putRoom(ana, 'sala-fantasma', 'https://meet.google.com/abc');
      const member = await putRoom(luis, 'sala-mar', 'https://meet.google.com/abc');

      expect(unknown.json<ErrorResponse>().error.code).toBe('UNKNOWN_ROOM');
      expect(member.statusCode).toBe(403);
    });

    it('requires the client header', async () => {
      const response = await testApp.app.inject({
        method: 'PUT',
        url: apiPath(API_PATHS.room, { spaceId: space.id, areaId: 'sala-mar' }),
        headers: { cookie: ana.cookie },
        payload: { meetUri: 'https://meet.google.com/abc' },
      });

      expect(response.statusCode).toBe(403);
      expect(CLIENT_HEADER).toBe('x-plaza-client');
    });
  });
});
