import {
  API_PATHS,
  apiPath,
  SpaceResponseSchema,
  type ErrorResponse,
  type SpaceDetailDto,
} from '@bululu/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { modules } from '../modules/index.js';
import type { BululuModule } from '../modules/types.js';
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
    name: 'PATCH member role',
    method: 'PATCH',
    url: (s, ids) => apiPath(API_PATHS.member, { spaceId: s.id, userId: ids.member }),
    payload: { role: 'OWNER' },
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
  {
    name: 'GET bans',
    method: 'GET',
    url: (s) => apiPath(API_PATHS.bans, { spaceId: s.id }),
    expected: { anonymous: 401, outsider: 404, member: 403, owner: 200 },
  },
  {
    // Nobody is banned: the owner is allowed and gets 404 for this person.
    name: 'DELETE ban',
    method: 'DELETE',
    url: (s, ids) => apiPath(API_PATHS.ban, { spaceId: s.id, userId: ids.member }),
    expected: { anonymous: 401, outsider: 404, member: 403, owner: 404 },
  },
  {
    name: 'GET messages',
    method: 'GET',
    url: (s) => apiPath(API_PATHS.messages, { spaceId: s.id }),
    expected: { anonymous: 401, outsider: 404, member: 200, owner: 200 },
  },
  {
    name: 'GET desks',
    method: 'GET',
    url: (s) => apiPath(API_PATHS.desks, { spaceId: s.id }),
    expected: { anonymous: 401, outsider: 404, member: 200, owner: 200 },
  },
  {
    name: 'PUT desk (claim for oneself)',
    method: 'PUT',
    url: (s) => apiPath(API_PATHS.desk, { spaceId: s.id, deskId: 'desk-01' }),
    payload: {},
    expected: { anonymous: 401, outsider: 404, member: 200, owner: 200 },
  },
  {
    name: 'PUT desk (assign to someone else)',
    method: 'PUT',
    url: (s) => apiPath(API_PATHS.desk, { spaceId: s.id, deskId: 'desk-01' }),
    payload: { userId: 'OWNER_ID' },
    expected: { anonymous: 401, outsider: 404, member: 403, owner: 200 },
  },
  {
    name: 'DELETE desk (a free one)',
    method: 'DELETE',
    url: (s) => apiPath(API_PATHS.desk, { spaceId: s.id, deskId: 'desk-01' }),
    expected: { anonymous: 401, outsider: 404, member: 204, owner: 204 },
  },
  {
    name: 'PATCH desk decor (a desk that is not theirs)',
    method: 'PATCH',
    url: (s) => apiPath(API_PATHS.deskDecor, { spaceId: s.id, deskId: 'desk-01' }),
    payload: { slots: ['plant'] },
    expected: { anonymous: 401, outsider: 404, member: 403, owner: 403 },
  },
  {
    // E6-S2 / E8-S7: "Unirse a la reunión" reported by the client (metric O6).
    name: 'POST product event',
    method: 'POST',
    url: (s) => apiPath(API_PATHS.events, { spaceId: s.id }),
    payload: { name: 'room_meet_opened', props: { areaId: 'sala-reuniones' } },
    expected: { anonymous: 401, outsider: 404, member: 204, owner: 204 },
  },
];

/**
 * Routes that answer without a session. Every other route of the app must answer 401 to an
 * anonymous request (checked over the live route table, so a new route cannot skip it).
 */
const PUBLIC_ROUTES = new Set([
  'GET /api/health',
  'GET /api/auth/google',
  'GET /api/auth/google/callback',
  'POST /api/auth/logout',
  'POST /api/auth/test-login',
  // Invitation preview (space name and member count), behind the 256-bit token.
  'GET /api/join/:token',
  // Static catalogs of the packaged maps and avatars (no user data).
  'GET /api/avatars',
  'GET /api/map-templates',
]);

/** Records every route registered after it (`onRoute`), HEAD excluded. */
function routeRecorder(routes: string[]): BululuModule {
  return {
    name: 'route-recorder',
    register({ app }) {
      app.addHook('onRoute', (route) => {
        const methods = Array.isArray(route.method) ? route.method : [route.method];
        for (const method of methods) if (method !== 'HEAD') routes.push(`${method} ${route.url}`);
      });
    },
  };
}

function fillParams(url: string): string {
  return url.replace(/:([A-Za-z]+)/g, (_match, name: string) => `unknown-${name}`);
}

describe('route inventory (E8-S2)', () => {
  const routes: string[] = [];
  let testApp: TestApp;

  beforeAll(async () => {
    testApp = await buildTestApp({ modules: [routeRecorder(routes), ...modules] });
    await testApp.app.ready();
  });

  afterAll(async () => {
    await testApp.app.close();
  });

  it('requires a session on every route except the public ones', async () => {
    expect(routes.length).toBeGreaterThan(20);
    const answers: Record<string, number> = {};
    for (const route of routes.filter((r) => !PUBLIC_ROUTES.has(r))) {
      const [method = 'GET', url = '/'] = route.split(' ');
      const response = await testApp.app.inject({
        method: method as Method,
        url: fillParams(url),
        headers: { 'x-bululu-client': 'test' },
        ...(method !== 'GET' && method !== 'DELETE' && { payload: {} }),
      });
      answers[route] = response.statusCode;
    }

    const notProtected = Object.entries(answers).filter(([, status]) => status !== 401);
    expect(notProtected).toEqual([]);
  });

  it('lists every public route that exists, and the matrix covers every space route', () => {
    for (const route of PUBLIC_ROUTES) expect(routes).toContain(route);
    const matrix = new Set(
      ENDPOINTS.map((endpoint) => {
        const template = Object.values(API_PATHS).find(
          (path) =>
            endpoint.url({ id: 'S', slug: 'L' } as SpaceDetailDto, { member: 'M', owner: 'O' }) ===
            path
              .replace(':spaceId', 'S')
              .replace(':slug', 'L')
              .replace(':userId', 'M')
              .replace(':deskId', 'desk-01')
              .replace(':areaId', 'sala-mar'),
        );
        return `${endpoint.method} ${template ?? '?'}`;
      }),
    );
    const spaceRoutes = routes.filter((route) => route.includes('/api/spaces/:spaceId'));
    expect(spaceRoutes.filter((route) => !matrix.has(route))).toEqual([]);
  });
});

describe('authorization matrix of the space endpoints', () => {
  let testApp: TestApp;
  let users: Record<Exclude<Actor, 'anonymous'>, TestUser>;
  let space: SpaceDetailDto;

  beforeAll(async () => {
    // Many requests from one address: the HTTP rate limit is tested elsewhere.
    testApp = await buildTestApp({ env: { RATE_LIMIT_PER_MINUTE: '100000' } });
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
    const headers = actor === 'anonymous' ? { 'x-bululu-client': 'test' } : users[actor].headers;

    const payload =
      endpoint.payload?.userId === 'OWNER_ID'
        ? { ...endpoint.payload, userId: ids.owner }
        : endpoint.payload;
    const response = await testApp.app.inject({
      method: endpoint.method,
      url: endpoint.url(space, ids),
      headers,
      ...(payload !== undefined && { payload }),
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
