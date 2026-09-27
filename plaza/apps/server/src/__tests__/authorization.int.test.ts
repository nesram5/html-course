import {
  API_PATHS,
  apiPath,
  SpaceResponseSchema,
  type ErrorResponse,
  type SpaceDetailDto,
} from '@plaza/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { buildTestApp, type TestApp } from '../test/app.js';
import { resetDatabase } from '../test/db.js';
import { signIn, type TestUser } from '../test/session.js';

type Actor = 'anonymous' | 'outsider' | 'member' | 'owner';
type Method = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';

interface Endpoint {
  name: string;
  method: Method;
  url: (space: SpaceDetailDto, ids: { member: string; owner: string }) => string;
  payload?: Record<string, unknown>;
  /** Expected status per actor. */
  expected: Record<Actor, number>;
}

const MEET = 'https://meet.google.com/abc-defg-hij';

/**
 * Every space-scoped endpoint against every kind of caller (E2-S2, E2-S4, E2-S6, E2-S7, E5-S3):
 * anonymous → 401, not a member → 404 (existence not leaked), member → 403 on owner-only
 * actions, owner → allowed.
 */
const ENDPOINTS: Endpoint[] = [
  {
    name: 'GET space',
    method: 'GET',
    url: (s) => apiPath(API_PATHS.space, { spaceId: s.id }),
    expected: { anonymous: 401, outsider: 404, member: 200, owner: 200 },
  },
  {
    name: 'PATCH space (allowedDomain)',
    method: 'PATCH',
    url: (s) => apiPath(API_PATHS.space, { spaceId: s.id }),
    payload: { allowedDomain: 'acme.com' },
    expected: { anonymous: 401, outsider: 404, member: 403, owner: 200 },
  },
  {
    name: 'PATCH space (name)',
    method: 'PATCH',
    url: (s) => apiPath(API_PATHS.space, { spaceId: s.id }),
    payload: { name: 'Otra' },
    expected: { anonymous: 401, outsider: 404, member: 403, owner: 200 },
  },
  {
    name: 'POST enter by slug',
    method: 'POST',
    url: (s) => apiPath(API_PATHS.spaceEnterBySlug, { slug: s.slug }),
    expected: { anonymous: 401, outsider: 404, member: 200, owner: 200 },
  },
  {
    name: 'POST invite-link',
    method: 'POST',
    url: (s) => apiPath(API_PATHS.inviteLink, { spaceId: s.id }),
    expected: { anonymous: 401, outsider: 404, member: 403, owner: 200 },
  },
  {
    name: 'GET members',
    method: 'GET',
    url: (s) => apiPath(API_PATHS.members, { spaceId: s.id }),
    expected: { anonymous: 401, outsider: 404, member: 200, owner: 200 },
  },
  {
    name: 'DELETE member',
    method: 'DELETE',
    url: (s, ids) => apiPath(API_PATHS.member, { spaceId: s.id, userId: ids.member }),
    expected: { anonymous: 401, outsider: 404, member: 403, owner: 204 },
  },
  {
    name: 'GET rooms',
    method: 'GET',
    url: (s) => apiPath(API_PATHS.rooms, { spaceId: s.id }),
    expected: { anonymous: 401, outsider: 404, member: 200, owner: 200 },
  },
  {
    name: 'POST rooms/authorize',
    method: 'POST',
    url: (s) => apiPath(API_PATHS.roomsAuthorize, { spaceId: s.id }),
    expected: { anonymous: 401, outsider: 404, member: 403, owner: 200 },
  },
  {
    name: 'PUT room link',
    method: 'PUT',
    url: (s) => apiPath(API_PATHS.room, { spaceId: s.id, areaId: 'sala-mar' }),
    payload: { meetUri: MEET },
    expected: { anonymous: 401, outsider: 404, member: 403, owner: 200 },
  },
  {
    name: 'POST media-token',
    method: 'POST',
    url: (s) => apiPath(API_PATHS.mediaToken, { spaceId: s.id }),
    expected: { anonymous: 401, outsider: 404, member: 200, owner: 200 },
  },
];

describe('authorization matrix of the space endpoints', () => {
  let testApp: TestApp;
  let users: Record<Exclude<Actor, 'anonymous'>, TestUser>;
  let space: SpaceDetailDto;

  beforeAll(async () => {
    testApp = await buildTestApp();
  });

  afterAll(async () => {
    await testApp.app.close();
  });

  beforeEach(async () => {
    await resetDatabase(testApp.container.db);
    users = {
      owner: await signIn(testApp.app, 'ana@acme.com'),
      member: await signIn(testApp.app, 'luis@gmail.com'),
      // Same e-mail domain as a future allowedDomain, but never joined.
      outsider: await signIn(testApp.app, 'eve@acme.com'),
    };
    const created = await testApp.app.inject({
      method: 'POST',
      url: API_PATHS.spaces,
      headers: users.owner.headers,
      payload: { name: 'Oficina Acme', mapTemplateId: 'campus@1' },
    });
    space = SpaceResponseSchema.parse(created.json()).space;
    const token = new URL(space.inviteUrl ?? '').pathname.split('/').pop() ?? '';
    const joined = await testApp.app.inject({
      method: 'POST',
      url: apiPath(API_PATHS.join, { token }),
      headers: users.member.headers,
    });
    expect(joined.statusCode).toBe(200);
  });

  const cases = ENDPOINTS.flatMap((endpoint) =>
    (['anonymous', 'outsider', 'member', 'owner'] as const).map(
      (actor) => [endpoint.name, actor, endpoint] as const,
    ),
  );

  it.each(cases)('%s as %s', async (_name, actor, endpoint) => {
    const ids = { member: users.member.user.id, owner: users.owner.user.id };
    const headers = actor === 'anonymous' ? { 'x-plaza-client': 'test' } : users[actor].headers;

    const response = await testApp.app.inject({
      method: endpoint.method,
      url: endpoint.url(space, ids),
      headers,
      ...(endpoint.payload !== undefined && { payload: endpoint.payload }),
    });

    expect(response.statusCode, response.body).toBe(endpoint.expected[actor]);
    if (actor === 'outsider') {
      // Non-members cannot tell a space they do not belong to from one that does not exist.
      expect(response.json<ErrorResponse>().error.code).toBe('NOT_A_MEMBER');
    }
  });

  it('a member cannot kick the owner nor another member', async () => {
    const carla = await signIn(testApp.app, 'carla@acme.com');
    const token = new URL(space.inviteUrl ?? '').pathname.split('/').pop() ?? '';
    await testApp.app.inject({
      method: 'POST',
      url: apiPath(API_PATHS.join, { token }),
      headers: carla.headers,
    });

    for (const target of [users.owner.user.id, carla.user.id]) {
      const response = await testApp.app.inject({
        method: 'DELETE',
        url: apiPath(API_PATHS.member, { spaceId: space.id, userId: target }),
        headers: users.member.headers,
      });
      expect(response.statusCode).toBe(403);
    }
    expect(await testApp.container.db.membership.count({ where: { spaceId: space.id } })).toBe(3);
  });

  it('the owner of another space gets 404 on this one', async () => {
    const other = await testApp.app.inject({
      method: 'POST',
      url: API_PATHS.spaces,
      headers: users.outsider.headers,
      payload: { name: 'Otra oficina', mapTemplateId: 'office-small@1' },
    });
    expect(other.statusCode).toBe(201);

    const response = await testApp.app.inject({
      method: 'POST',
      url: apiPath(API_PATHS.inviteLink, { spaceId: space.id }),
      headers: users.outsider.headers,
    });

    expect(response.statusCode).toBe(404);
  });
});
