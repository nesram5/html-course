import { API_PATHS, apiPath, SpaceResponseSchema, type ErrorResponse } from '@plaza/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { buildTestApp, type TestApp } from '../../../test/app.js';
import { resetDatabase } from '../../../test/db.js';
import { signIn, type TestUser } from '../../../test/session.js';

describe('events module: product events without personal data (E6-S2, E8-S7)', () => {
  let t: TestApp;
  let ana: TestUser;
  let zoe: TestUser;
  let spaceId: string;

  beforeAll(async () => {
    t = await buildTestApp();
  });

  afterAll(async () => {
    await t.app.close();
  });

  beforeEach(async () => {
    await resetDatabase(t.container.db);
    ana = await signIn(t.app, 'ana@acme.com', { displayName: 'Ana' });
    zoe = await signIn(t.app, 'zoe@other.com', { displayName: 'Zoe' });
    const created = await t.app.inject({
      method: 'POST',
      url: API_PATHS.spaces,
      headers: ana.headers,
      payload: { name: 'Oficina Acme', mapTemplateId: 'office-small@1' },
    });
    spaceId = SpaceResponseSchema.parse(created.json()).space.id;
  });

  function track(user: TestUser, payload: unknown, id = spaceId) {
    return t.app.inject({
      method: 'POST',
      url: apiPath(API_PATHS.events, { spaceId: id }),
      headers: user.headers,
      payload: payload as Record<string, unknown>,
    });
  }

  it('records room_meet_opened for a member: the space, the actor id and the room, nothing else', async () => {
    const response = await track(ana, {
      name: 'room_meet_opened',
      props: { areaId: 'sala-reuniones' },
    });

    expect(response.statusCode).toBe(204);
    const rows = await t.container.db.productEvent.findMany();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      name: 'room_meet_opened',
      spaceId,
      actorId: ana.user.id,
      props: { areaId: 'sala-reuniones' },
    });
    // No name, email or anything personal is stored.
    expect(JSON.stringify(rows[0])).not.toMatch(/ana@acme\.com|"Ana"/);
  });

  it('answers 404 to non-members, without recording anything', async () => {
    const response = await track(zoe, {
      name: 'room_meet_opened',
      props: { areaId: 'sala-reuniones' },
    });

    expect(response.statusCode).toBe(404);
    expect(response.json<ErrorResponse>().error.code).toBe('NOT_A_MEMBER');
    expect(await t.container.db.productEvent.count()).toBe(0);
  });

  it('refuses events only the server may record, extra properties and unknown names', async () => {
    const refused = [
      { name: 'room_entered', props: { areaId: 'sala-reuniones' } },
      { name: 'room_meet_opened', props: { areaId: 'sala-reuniones', email: 'ana@acme.com' } },
      { name: 'room_meet_opened' },
      { name: 'something_else' },
    ];
    for (const payload of refused) {
      const response = await track(ana, payload);
      expect(response.statusCode).toBe(400);
      expect(response.json<ErrorResponse>().error.code).toBe('VALIDATION_ERROR');
    }
    expect(await t.container.db.productEvent.count()).toBe(0);
  });

  it('needs a session and the X-Plaza-Client header', async () => {
    const anonymous = await t.app.inject({
      method: 'POST',
      url: apiPath(API_PATHS.events, { spaceId }),
      headers: { 'x-plaza-client': 'test' },
      payload: { name: 'room_meet_opened', props: { areaId: 'sala-reuniones' } },
    });
    const noHeader = await t.app.inject({
      method: 'POST',
      url: apiPath(API_PATHS.events, { spaceId }),
      headers: { cookie: ana.cookie },
      payload: { name: 'room_meet_opened', props: { areaId: 'sala-reuniones' } },
    });

    expect(anonymous.statusCode).toBe(401);
    expect(noHeader.statusCode).toBe(403);
  });

  it('rate-limits each person to a burst of 10', async () => {
    const payload = { name: 'room_meet_opened', props: { areaId: 'sala-reuniones' } };
    const codes: number[] = [];
    for (let i = 0; i < 12; i++) codes.push((await track(ana, payload)).statusCode);

    expect(codes.slice(0, 10).every((code) => code === 204)).toBe(true);
    expect(codes.slice(10)).toEqual([429, 429]);
    expect(await t.container.db.productEvent.count()).toBe(10);
  });
});
