import { createHash } from 'node:crypto';

import {
  API_PATHS,
  apiPath,
  EnterSpaceResponseSchema,
  JoinResponseSchema,
  MapTemplatesResponseSchema,
  MembersResponseSchema,
  SpaceResponseSchema,
  SpacesResponseSchema,
  type ErrorResponse,
  type SpaceDetailDto,
} from '@plaza/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { buildTestApp, type TestApp } from '../../../test/app.js';
import { resetDatabase } from '../../../test/db.js';
import { signIn, type TestUser } from '../../../test/session.js';

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

describe('spaces module (E2-S2..S6)', () => {
  let testApp: TestApp;
  let ana: TestUser;
  let luis: TestUser;

  beforeAll(async () => {
    testApp = await buildTestApp();
  });

  afterAll(async () => {
    await testApp.app.close();
  });

  beforeEach(async () => {
    await resetDatabase(testApp.container.db);
    ana = await signIn(testApp.app, 'ana@acme.com', { displayName: 'Ana' });
    luis = await signIn(testApp.app, 'luis@gmail.com', { displayName: 'Luis' });
  });

  function request(
    user: TestUser | null,
    method: 'GET' | 'POST' | 'PATCH' | 'DELETE' | 'PUT',
    url: string,
    payload?: Record<string, unknown>,
  ) {
    return testApp.app.inject({
      method,
      url,
      headers: user?.headers ?? { 'x-plaza-client': 'test' },
      ...(payload !== undefined && { payload }),
    });
  }

  async function createSpace(
    owner: TestUser = ana,
    body: { name: string; mapTemplateId: string } = {
      name: 'Oficina Acme',
      mapTemplateId: 'campus@1',
    },
  ): Promise<SpaceDetailDto> {
    const response = await request(owner, 'POST', API_PATHS.spaces, body);
    expect(response.statusCode).toBe(201);
    return SpaceResponseSchema.parse(response.json()).space;
  }

  function tokenOf(inviteUrl: string | null): string {
    return new URL(inviteUrl ?? '').pathname.split('/').pop() ?? '';
  }

  async function joinAs(user: TestUser, space: SpaceDetailDto) {
    return request(user, 'POST', apiPath(API_PATHS.join, { token: tokenOf(space.inviteUrl) }));
  }

  describe('create (E2-S2)', () => {
    it('creates the space with a unique slug, an invite link and me as OWNER', async () => {
      const space = await createSpace();

      expect(space).toMatchObject({
        name: 'Oficina Acme',
        slug: 'oficina-acme',
        mapTemplateId: 'campus@1',
        themeId: 'pixel',
        role: 'OWNER',
        ownerId: ana.user.id,
        allowedDomain: null,
        thumbnailUrl: '/assets/maps/templates/campus/themes/pixel/thumbnail.png',
      });
      expect(space.inviteUrl).toMatch(/^http:\/\/localhost:5173\/join\/[\w-]{43}$/);
      expect(space.rooms.map((room) => room.areaId)).toEqual([
        'sala-norte',
        'sala-sur',
        'sala-grande',
      ]);
      const membership = await testApp.container.db.membership.findUniqueOrThrow({
        where: { userId_spaceId: { userId: ana.user.id, spaceId: space.id } },
      });
      expect(membership.role).toBe('OWNER');
    });

    it('gives each space a different slug', async () => {
      const first = await createSpace();
      const second = await createSpace(luis, {
        name: 'Oficina ACME',
        mapTemplateId: 'office-small@1',
      });
      const third = await createSpace(ana, { name: '¡Ñandú Café!', mapTemplateId: 'campus@1' });

      expect([first.slug, second.slug, third.slug]).toEqual([
        'oficina-acme',
        'oficina-acme-2',
        'nandu-cafe',
      ]);
    });

    it('stores only the hash of the invite token', async () => {
      const space = await createSpace();

      const row = await testApp.container.db.space.findUniqueOrThrow({ where: { id: space.id } });
      const token = tokenOf(space.inviteUrl);
      expect(row.inviteTokenHash).toBe(sha256(token));
      expect(JSON.stringify(row)).not.toContain(token);
    });

    it('rejects an unknown template with 400 UNKNOWN_MAP_TEMPLATE', async () => {
      const response = await request(ana, 'POST', API_PATHS.spaces, {
        name: 'Oficina',
        mapTemplateId: 'castle@1',
      });

      expect(response.statusCode).toBe(400);
      expect(response.json<ErrorResponse>().error.code).toBe('UNKNOWN_MAP_TEMPLATE');
    });

    it('validates the name and requires a session and the client header', async () => {
      expect(
        (await request(ana, 'POST', API_PATHS.spaces, { name: ' ', mapTemplateId: 'campus@1' }))
          .statusCode,
      ).toBe(400);
      expect(
        (
          await request(null, 'POST', API_PATHS.spaces, {
            name: 'Oficina',
            mapTemplateId: 'campus@1',
          })
        ).statusCode,
      ).toBe(401);
      const noHeader = await testApp.app.inject({
        method: 'POST',
        url: API_PATHS.spaces,
        headers: { cookie: ana.cookie },
        payload: { name: 'Oficina', mapTemplateId: 'campus@1' },
      });
      expect(noHeader.statusCode).toBe(403);
    });

    it('answers 404 to non-members asking for a space', async () => {
      const space = await createSpace();

      const response = await request(luis, 'GET', apiPath(API_PATHS.space, { spaceId: space.id }));

      expect(response.statusCode).toBe(404);
      expect(response.json<ErrorResponse>().error.code).toBe('NOT_A_MEMBER');
    });

    it('lists the map templates of the catalog', async () => {
      const response = await request(null, 'GET', API_PATHS.mapTemplates);

      const { templates } = MapTemplatesResponseSchema.parse(response.json());
      expect(templates.map((t) => [t.id, t.roomCount, t.width, t.height])).toEqual([
        ['office-small@1', 1, 40, 30],
        ['campus@1', 3, 80, 60],
      ]);
      expect(templates[1]?.themes[1]).toMatchObject({
        id: 'night',
        baseThemeId: 'pixel',
        belowUrl: '/assets/maps/templates/campus/themes/pixel/below.png',
      });
    });
  });

  describe('my spaces (E2-S3)', () => {
    it('lists only the spaces I belong to, with my role', async () => {
      const acme = await createSpace();
      await createSpace(luis, { name: 'Casa de Luis', mapTemplateId: 'office-small@1' });
      await joinAs(luis, acme);

      const anaSpaces = SpacesResponseSchema.parse(
        (await request(ana, 'GET', API_PATHS.spaces)).json(),
      ).spaces;
      const luisSpaces = SpacesResponseSchema.parse(
        (await request(luis, 'GET', API_PATHS.spaces)).json(),
      ).spaces;

      expect(anaSpaces.map((s) => [s.slug, s.role])).toEqual([['oficina-acme', 'OWNER']]);
      expect(luisSpaces.map((s) => [s.slug, s.role])).toEqual([
        ['casa-de-luis', 'OWNER'],
        ['oficina-acme', 'MEMBER'],
      ]);
    });
  });

  describe('invite link and allowed domain (E2-S4)', () => {
    it('shows the invite link only to owners', async () => {
      const space = await createSpace();
      await joinAs(luis, space);

      const asMember = await request(luis, 'GET', apiPath(API_PATHS.space, { spaceId: space.id }));
      const asOwner = await request(ana, 'GET', apiPath(API_PATHS.space, { spaceId: space.id }));

      expect(SpaceResponseSchema.parse(asMember.json()).space.inviteUrl).toBeNull();
      expect(SpaceResponseSchema.parse(asOwner.json()).space.inviteUrl).toBe(space.inviteUrl);
    });

    it('regenerating the link revokes the previous one', async () => {
      const space = await createSpace();
      const oldToken = tokenOf(space.inviteUrl);

      const response = await request(
        ana,
        'POST',
        apiPath(API_PATHS.inviteLink, { spaceId: space.id }),
      );

      expect(response.statusCode).toBe(200);
      const newToken = tokenOf(response.json<{ url: string }>().url);
      expect(newToken).not.toBe(oldToken);
      const old = await request(null, 'GET', apiPath(API_PATHS.join, { token: oldToken }));
      expect(old.statusCode).toBe(404);
      expect(old.json<ErrorResponse>().error.code).toBe('INVALID_INVITE');
      const fresh = await request(null, 'GET', apiPath(API_PATHS.join, { token: newToken }));
      expect(fresh.statusCode).toBe(200);
      const detail = await request(ana, 'GET', apiPath(API_PATHS.space, { spaceId: space.id }));
      expect(SpaceResponseSchema.parse(detail.json()).space.inviteUrl).toContain(newToken);
    });

    it('forbids members to regenerate the link or change the domain (403)', async () => {
      const space = await createSpace();
      await joinAs(luis, space);

      const regenerate = await request(
        luis,
        'POST',
        apiPath(API_PATHS.inviteLink, { spaceId: space.id }),
      );
      const domain = await request(luis, 'PATCH', apiPath(API_PATHS.space, { spaceId: space.id }), {
        allowedDomain: 'gmail.com',
      });

      expect(regenerate.statusCode).toBe(403);
      expect(domain.statusCode).toBe(403);
    });

    it('lets verified e-mails of the allowed domain in without an invitation', async () => {
      const space = await createSpace();
      const patch = await request(ana, 'PATCH', apiPath(API_PATHS.space, { spaceId: space.id }), {
        allowedDomain: 'ACME.com',
      });
      expect(SpaceResponseSchema.parse(patch.json()).space.allowedDomain).toBe('acme.com');
      const carla = await signIn(testApp.app, 'carla@acme.com');
      const enterUrl = apiPath(API_PATHS.spaceEnterBySlug, { slug: space.slug });

      const first = EnterSpaceResponseSchema.parse((await request(carla, 'POST', enterUrl)).json());
      const again = EnterSpaceResponseSchema.parse((await request(carla, 'POST', enterUrl)).json());
      const outsider = await request(luis, 'POST', enterUrl);

      expect(first).toMatchObject({ joined: true, space: { id: space.id, role: 'MEMBER' } });
      expect(again.joined).toBe(false);
      expect(outsider.statusCode).toBe(404);
    });

    it('does not auto-join anybody when there is no allowed domain', async () => {
      const space = await createSpace();
      const carla = await signIn(testApp.app, 'carla@acme.com');

      const response = await request(
        carla,
        'POST',
        apiPath(API_PATHS.spaceEnterBySlug, { slug: space.slug }),
      );

      expect(response.statusCode).toBe(404);
    });

    it('lets members enter by slug and can clear the domain', async () => {
      const space = await createSpace();
      await request(ana, 'PATCH', apiPath(API_PATHS.space, { spaceId: space.id }), {
        allowedDomain: 'acme.com',
      });

      const cleared = await request(ana, 'PATCH', apiPath(API_PATHS.space, { spaceId: space.id }), {
        allowedDomain: null,
      });
      const enter = await request(
        ana,
        'POST',
        apiPath(API_PATHS.spaceEnterBySlug, { slug: space.slug }),
      );

      expect(SpaceResponseSchema.parse(cleared.json()).space.allowedDomain).toBeNull();
      expect(EnterSpaceResponseSchema.parse(enter.json())).toMatchObject({
        joined: false,
        space: { role: 'OWNER' },
      });
    });

    it('rejects an invalid domain and unknown themes', async () => {
      const space = await createSpace();
      const url = apiPath(API_PATHS.space, { spaceId: space.id });

      const domain = await request(ana, 'PATCH', url, { allowedDomain: 'not a domain' });
      const theme = await request(ana, 'PATCH', url, { themeId: 'watercolor' });
      const validTheme = await request(ana, 'PATCH', url, { themeId: 'night' });

      expect(domain.statusCode).toBe(400);
      expect(theme.json<ErrorResponse>().error.code).toBe('UNKNOWN_THEME');
      expect(SpaceResponseSchema.parse(validTheme.json()).space.themeId).toBe('night');
    });
  });

  describe('join (E2-S5)', () => {
    it('shows a public preview of the invitation', async () => {
      const space = await createSpace();

      const response = await request(
        null,
        'GET',
        apiPath(API_PATHS.join, { token: tokenOf(space.inviteUrl) }),
      );

      expect(response.json()).toEqual({
        space: { name: 'Oficina Acme', mapTemplateId: 'campus@1', memberCount: 1 },
      });
    });

    it('joins with the link, idempotently', async () => {
      const space = await createSpace();

      const first = JoinResponseSchema.parse((await joinAs(luis, space)).json());
      const second = JoinResponseSchema.parse((await joinAs(luis, space)).json());
      const owner = JoinResponseSchema.parse((await joinAs(ana, space)).json());

      expect(first).toMatchObject({
        alreadyMember: false,
        space: { slug: 'oficina-acme', role: 'MEMBER' },
      });
      expect(second.alreadyMember).toBe(true);
      expect(owner).toMatchObject({ alreadyMember: true, space: { role: 'OWNER' } });
      expect(await testApp.container.db.membership.count({ where: { spaceId: space.id } })).toBe(2);
    });

    it('requires a session to join', async () => {
      const space = await createSpace();

      const response = await joinAs({ ...luis, headers: { 'x-plaza-client': 'test' } }, space);

      expect(response.statusCode).toBe(401);
    });

    it('answers INVALID_INVITE to unknown or malformed tokens', async () => {
      const unknown = await request(
        luis,
        'POST',
        apiPath(API_PATHS.join, { token: 'x'.repeat(43) }),
      );
      const malformed = await request(null, 'GET', apiPath(API_PATHS.join, { token: 'short' }));

      expect(unknown.json<ErrorResponse>().error.code).toBe('INVALID_INVITE');
      expect(malformed.statusCode).toBe(404);
      expect(malformed.json<ErrorResponse>().error.code).toBe('INVALID_INVITE');
    });
  });

  describe('members (E2-S6)', () => {
    it('shows name, avatar, e-mail and role to owners; e-mails are hidden from members', async () => {
      const space = await createSpace();
      await joinAs(luis, space);
      const url = apiPath(API_PATHS.members, { spaceId: space.id });

      const asOwner = MembersResponseSchema.parse((await request(ana, 'GET', url)).json());
      const asMember = MembersResponseSchema.parse((await request(luis, 'GET', url)).json());

      expect(asOwner.members.map((m) => [m.displayName, m.avatarId, m.email, m.role])).toEqual([
        ['Ana', 'avatar-01', 'ana@acme.com', 'OWNER'],
        ['Luis', 'avatar-01', 'luis@gmail.com', 'MEMBER'],
      ]);
      expect(asMember.members.map((m) => m.email)).toEqual([null, null]);
    });

    it('kicking removes access at once', async () => {
      const space = await createSpace();
      await joinAs(luis, space);

      const kick = await request(
        ana,
        'DELETE',
        apiPath(API_PATHS.member, { spaceId: space.id, userId: luis.user.id }),
      );
      const after = await request(luis, 'GET', apiPath(API_PATHS.space, { spaceId: space.id }));

      expect(kick.statusCode).toBe(204);
      expect(after.statusCode).toBe(404);
    });

    it('does not let the only owner remove themselves', async () => {
      const space = await createSpace();

      const response = await request(
        ana,
        'DELETE',
        apiPath(API_PATHS.member, { spaceId: space.id, userId: ana.user.id }),
      );

      expect(response.statusCode).toBe(409);
      expect(response.json<ErrorResponse>().error.code).toBe('LAST_OWNER');
    });

    it('only owners can kick; unknown members are 404', async () => {
      const space = await createSpace();
      await joinAs(luis, space);

      const byMember = await request(
        luis,
        'DELETE',
        apiPath(API_PATHS.member, { spaceId: space.id, userId: ana.user.id }),
      );
      const unknown = await request(
        ana,
        'DELETE',
        apiPath(API_PATHS.member, { spaceId: space.id, userId: 'nobody' }),
      );

      expect(byMember.statusCode).toBe(403);
      expect(unknown.statusCode).toBe(404);
    });
  });
});
