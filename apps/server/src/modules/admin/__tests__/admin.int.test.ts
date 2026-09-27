import {
  AdminMetricsResponseSchema,
  API_PATHS,
  FEEDBACK_RATE_PER_HOUR,
  MeResponseSchema,
  SpaceResponseSchema,
  type SpaceDetailDto,
} from '@plaza/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { buildTestApp, type TestApp } from '../../../test/app.js';
import { resetDatabase } from '../../../test/db.js';
import { signIn, type TestUser } from '../../../test/session.js';

const NOW = new Date('2026-09-27T12:00:00.000Z');

describe('admin metrics page and in-app feedback (E8-S7)', () => {
  let testApp: TestApp;
  let admin: TestUser;
  let luis: TestUser;
  let space: SpaceDetailDto;

  beforeAll(async () => {
    testApp = await buildTestApp({
      env: { ADMIN_EMAILS: 'Producto@Plaza.dev' },
      overrides: { now: () => NOW },
    });
  });

  afterAll(async () => {
    await testApp.app.close();
  });

  beforeEach(async () => {
    await resetDatabase(testApp.container.db);
    admin = await signIn(testApp.app, 'producto@plaza.dev', { displayName: 'Producto' });
    luis = await signIn(testApp.app, 'luis@acme.com', { displayName: 'Luis' });
    const created = await testApp.app.inject({
      method: 'POST',
      url: API_PATHS.spaces,
      headers: luis.headers,
      payload: { name: 'Oficina Acme', mapTemplateId: 'office-small@1' },
    });
    space = SpaceResponseSchema.parse(created.json()).space;
  });

  function metrics(user: TestUser | null, query = '') {
    return testApp.app.inject({
      method: 'GET',
      url: `${API_PATHS.adminMetrics}${query}`,
      headers: user === null ? {} : { cookie: user.cookie },
    });
  }

  function feedback(user: TestUser, payload: Record<string, unknown>) {
    return testApp.app.inject({
      method: 'POST',
      url: API_PATHS.feedback,
      headers: user.headers,
      payload,
    });
  }

  it('tells the web app who is an admin', async () => {
    const me = async (user: TestUser) =>
      MeResponseSchema.parse(
        (await testApp.app.inject({ url: API_PATHS.me, headers: { cookie: user.cookie } })).json(),
      ).user.isAdmin;

    expect(await me(admin)).toBe(true);
    expect(await me(luis)).toBe(false);
  });

  it('shows the metrics to the people in ADMIN_EMAILS only', async () => {
    expect((await metrics(null)).statusCode).toBe(401);
    const member = await metrics(luis);
    expect(member.statusCode).toBe(404);
    expect(member.json()).toMatchObject({ error: { code: 'NOT_FOUND' } });
    expect((await metrics(admin, '?days=1000')).statusCode).toBe(400);

    const ok = await metrics(admin);
    expect(ok.statusCode).toBe(200);
    expect(AdminMetricsResponseSchema.parse(ok.json())).toMatchObject({ days: 28, feedback: [] });
  });

  it('aggregates the stored events and lists the feedback, newest first', async () => {
    const { db } = testApp.container;
    const day = (d: number, hour = 10) => new Date(Date.UTC(2026, 8, d, hour));
    await db.productEvent.createMany({
      data: [
        { name: 'space_joined', spaceId: space.id, actorId: 'x1', createdAt: day(25) },
        { name: 'space_joined', spaceId: space.id, actorId: 'x2', createdAt: day(26) },
        {
          name: 'conversation_ended',
          spaceId: space.id,
          actorId: 'x1',
          props: { durationMs: 90_000, maxPeers: 1 },
          createdAt: day(25),
        },
        {
          name: 'av_first_frame',
          spaceId: space.id,
          actorId: 'x1',
          props: { valueMs: 800 },
          createdAt: day(25),
        },
        { name: 'room_entered', spaceId: space.id, actorId: 'x1', createdAt: day(25) },
        { name: 'room_entered', spaceId: space.id, actorId: 'x1', createdAt: day(26) },
        { name: 'room_meet_opened', spaceId: space.id, actorId: 'x1', createdAt: day(26) },
        // Older than the 28 days of the window.
        { name: 'room_entered', spaceId: space.id, actorId: 'x1', createdAt: day(1) },
      ],
    });
    expect(
      (await feedback(luis, { message: 'Muy útil', rating: 5, spaceId: space.id })).statusCode,
    ).toBe(204);
    expect((await feedback(luis, { message: 'Falta el modo oscuro' })).statusCode).toBe(204);

    const body = AdminMetricsResponseSchema.parse((await metrics(admin, '?days=7')).json());

    expect(body.days).toBe(7);
    expect(body.o1).toEqual({ conversations: 1, activeUserDays: 2, perActiveUserPerDay: 0.5 });
    expect(body.o2.spaces).toEqual([
      expect.objectContaining({ spaceId: space.id, name: 'Oficina Acme', daysPerWeek: [2] }),
    ]);
    expect(body.o3).toEqual({ samples: 1, p50Ms: 800, p95Ms: 800 });
    expect(body.o6).toEqual({ roomEntries: 2, meetOpened: 1, rate: 0.5 });
    expect(body.feedback.map((f) => [f.message, f.rating, f.authorEmail, f.spaceName])).toEqual(
      expect.arrayContaining([
        ['Muy útil', 5, 'luis@acme.com', 'Oficina Acme'],
        ['Falta el modo oscuro', null, 'luis@acme.com', null],
      ]),
    );
  });

  it('validates feedback, ignores spaces I am not in and limits it per person', async () => {
    const eva = await signIn(testApp.app, 'eva@other.com', { displayName: 'Eva' });
    expect((await feedback(eva, { message: '   ' })).statusCode).toBe(400);
    expect((await feedback(eva, { message: 'ok', rating: 9 })).statusCode).toBe(400);
    expect(
      (
        await testApp.app.inject({
          method: 'POST',
          url: API_PATHS.feedback,
          headers: { 'x-plaza-client': 'test' },
          payload: { message: 'anon' },
        })
      ).statusCode,
    ).toBe(401);

    expect((await feedback(eva, { message: 'Hola', spaceId: space.id })).statusCode).toBe(204);
    const stored = await testApp.container.db.feedback.findFirstOrThrow({
      where: { userId: eva.user.id },
    });
    expect(stored.spaceId).toBeNull();

    const statuses: number[] = [];
    for (let i = 0; i < FEEDBACK_RATE_PER_HOUR; i++) {
      statuses.push((await feedback(eva, { message: `Idea ${String(i)}` })).statusCode);
    }
    expect(statuses.at(-1)).toBe(429);
    expect(await testApp.container.db.feedback.count({ where: { userId: eva.user.id } })).toBe(
      FEEDBACK_RATE_PER_HOUR - 2,
    );
  });
});
