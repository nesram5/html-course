import {
  AdminMetricsResponseSchema,
  API_PATHS,
  apiPath,
  CONVERSATION_MIN_MS,
  PROTOCOL_VERSION,
  SpaceResponseSchema,
  TELEMETRY_RATE_PER_MINUTE,
  type ErrorResponse,
  type SpaceDetailDto,
} from '@plaza/shared';
import { z } from 'zod';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { buildTestApp, type TestApp } from '../../../test/app.js';
import { resetDatabase } from '../../../test/db.js';
import { ManualTimers } from '../../../test/manual-timers.js';
import { RealtimeHarness } from '../../../test/realtime.js';
import { signIn, type TestUser } from '../../../test/session.js';
import { actorIdOf } from '../index.js';

const SECRET = 'test-session-secret-at-least-32-characters';
const ROW = 25;
const MEET_OPENED = { name: 'room_meet_opened', props: { areaId: 'sala-reuniones' } };

describe('product events and telemetry (E8-S7)', () => {
  const timers = new ManualTimers();
  const harness = new RealtimeHarness({ timers, env: { ADMIN_EMAILS: 'producto@plaza.dev' } });
  let ana: TestUser;
  let luis: TestUser;
  let eva: TestUser;
  let space: SpaceDetailDto;

  beforeAll(async () => {
    await harness.start();
  });

  afterAll(async () => {
    await harness.stop();
  });

  beforeEach(async () => {
    await resetDatabase(harness.testApp.container.db);
    ana = await harness.signIn('ana@acme.com', 'Ana');
    luis = await harness.signIn('luis@acme.com', 'Luis');
    eva = await harness.signIn('eva@other.com', 'Eva');
    space = await harness.createSpace(ana, [luis]);
  });

  afterEach(() => {
    harness.reset();
  });

  async function stored(name?: string) {
    await harness.events.flush();
    return harness.testApp.container.db.productEvent.findMany({
      where: name === undefined ? {} : { name },
      orderBy: { createdAt: 'asc' },
    });
  }

  function post(user: TestUser, url: string, payload: Record<string, unknown>) {
    return harness.testApp.app.inject({ method: 'POST', url, headers: user.headers, payload });
  }

  it('records space_joined once per visit, with a pseudonymous actor and no personal data', async () => {
    const { client } = await harness.enter(ana, space.id);
    // Re-joining on the same socket (and reconnecting) is not a new visit.
    await harness.barrier(space.id, client);
    await harness.enter(ana, space.id);

    const events = await stored('space_joined');
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ spaceId: space.id, actorId: actorIdOf(SECRET, ana.user.id) });
    expect(events[0]?.actorId).not.toContain(ana.user.id);
    expect(JSON.stringify(events)).not.toMatch(/ana@acme\.com|"Ana"/);
  });

  it('records a hallway conversation per person, with its duration (O1)', async () => {
    const a = await harness.enter(ana, space.id);
    const l = await harness.enter(luis, space.id);
    const runtime = harness.world.store.get(space.id);
    if (runtime === undefined) throw new Error('runtime not loaded');
    runtime.place(ana.user.id, { x: 5, y: ROW });
    runtime.place(luis.user.id, { x: 7, y: ROW });
    await harness.tick(space.id, a.client, l.client);

    expect((await stored('conversation_started')).map((e) => e.actorId).sort()).toEqual(
      [actorIdOf(SECRET, ana.user.id), actorIdOf(SECRET, luis.user.id)].sort(),
    );
    expect(await stored('conversation_ended')).toEqual([]);

    // They talk for 40 s, then Luis walks away (5 tiles: the conversation ends).
    timers.advance(CONVERSATION_MIN_MS + 10_000);
    runtime.place(luis.user.id, { x: 10, y: ROW });
    await harness.tick(space.id, a.client, l.client);

    const ended = await stored('conversation_ended');
    expect(ended).toHaveLength(2);
    for (const event of ended) {
      expect(event.spaceId).toBe(space.id);
      expect(event.props).toMatchObject({ maxPeers: 1 });
      const { durationMs } = z.object({ durationMs: z.number() }).parse(event.props);
      expect(durationMs).toBeGreaterThan(CONVERSATION_MIN_MS);
    }
  });

  it('ends the conversation of someone who leaves the office', async () => {
    const a = await harness.enter(ana, space.id);
    const l = await harness.enter(luis, space.id);
    const runtime = harness.world.store.get(space.id);
    runtime?.place(ana.user.id, { x: 5, y: ROW });
    runtime?.place(luis.user.id, { x: 6, y: ROW });
    await harness.tick(space.id, a.client, l.client);

    l.client.disconnect();
    await harness.tick(space.id, a.client);
    await harness.tick(space.id, a.client);

    expect((await stored('conversation_ended')).map((e) => e.actorId).sort()).toEqual(
      [actorIdOf(SECRET, ana.user.id), actorIdOf(SECRET, luis.user.id)].sort(),
    );
  });

  it('takes client events from members only and refuses the ones the server computes', async () => {
    const url = apiPath(API_PATHS.events, { spaceId: space.id });

    expect((await post(luis, url, MEET_OPENED)).statusCode).toBe(204);
    expect((await post(eva, url, MEET_OPENED)).statusCode).toBe(404);
    for (const name of ['space_joined', 'conversation_started', 'room_entered']) {
      const refused = await post(luis, url, { name });
      expect(refused.statusCode).toBe(400);
      expect(refused.json()).toMatchObject({ error: { code: 'VALIDATION_ERROR' } });
    }
    expect((await post(luis, url, { name: 'clicked' })).statusCode).toBe(400);
    const unauthenticated = await harness.testApp.app.inject({
      method: 'POST',
      url,
      headers: { 'x-plaza-client': 'test' },
      payload: MEET_OPENED,
    });
    expect(unauthenticated.statusCode).toBe(401);

    expect((await stored()).map((event) => event.name)).toEqual(['room_meet_opened']);
  });

  it('shows the room entries of the world and the Meet openings of the client in the admin O6 (E6-S2)', async () => {
    const admin = await harness.signIn('producto@plaza.dev', 'Producto');
    const l = await harness.enter(luis, space.id);
    const runtime = harness.world.store.get(space.id);
    if (runtime === undefined) throw new Error('runtime not loaded');
    // office-small@1: "sala-reuniones" is entered from (27,6) → (28,6).
    runtime.place(luis.user.id, { x: 27, y: 6 });
    l.client.emit('player:move', { v: PROTOCOL_VERSION, x: 28, y: 6, dir: 'right' });
    await harness.barrier(space.id, l.client);
    expect(harness.world.inMeetingRoom(space.id, luis.user.id)).toBe(true);
    const url = apiPath(API_PATHS.events, { spaceId: space.id });
    expect((await post(luis, url, MEET_OPENED)).statusCode).toBe(204);

    const entered = await stored('room_entered');
    expect(entered).toMatchObject([
      {
        spaceId: space.id,
        actorId: actorIdOf(SECRET, luis.user.id),
        props: { areaId: 'sala-reuniones' },
      },
    ]);
    const metrics = await harness.testApp.app.inject({
      url: API_PATHS.adminMetrics,
      headers: { cookie: admin.cookie },
    });
    expect(metrics.statusCode).toBe(200);
    expect(AdminMetricsResponseSchema.parse(metrics.json()).o6).toEqual({
      roomEntries: 1,
      meetOpened: 1,
      rate: 1,
    });
  });

  it('stores telemetry samples of my spaces and drops the others', async () => {
    const other = await harness.createSpace(eva, []);
    const response = await post(luis, API_PATHS.telemetry, {
      samples: [
        { metric: 'av_first_frame', spaceId: space.id, valueMs: 640 },
        { metric: 'join_time', spaceId: space.id, valueMs: 18_500 },
        { metric: 'session_started', spaceId: space.id, sessionKey: 'visit-0001' },
        {
          metric: 'session_error',
          spaceId: space.id,
          sessionKey: 'visit-0001',
          kind: 'media_lost',
        },
        { metric: 'av_first_frame', spaceId: other.id, valueMs: 1 },
      ],
    });

    expect(response.statusCode).toBe(204);
    const events = await stored();
    expect(events.map((e) => [e.name, e.spaceId, e.props])).toEqual([
      ['av_first_frame', space.id, { valueMs: 640 }],
      ['join_time', space.id, { valueMs: 18_500 }],
      ['session_started', space.id, { sessionKey: 'visit-0001' }],
      ['session_error', space.id, { sessionKey: 'visit-0001', kind: 'media_lost' }],
    ]);
    expect(new Set(events.map((e) => e.actorId))).toEqual(
      new Set([actorIdOf(SECRET, luis.user.id)]),
    );
  });

  it('validates telemetry and limits it per session', async () => {
    const sample = { metric: 'av_first_frame', spaceId: space.id, valueMs: 500 };
    const invalid = [
      { samples: [] },
      { samples: Array.from({ length: 21 }, () => sample) },
      { samples: [{ ...sample, valueMs: -1 }] },
      { samples: [{ ...sample, valueMs: 10 * 60_000 + 1 }] },
      { samples: [{ metric: 'session_started', spaceId: space.id, sessionKey: 'a b' }] },
      { samples: [{ metric: 'cpu', spaceId: space.id, valueMs: 1 }] },
    ];
    for (const body of invalid) {
      expect((await post(ana, API_PATHS.telemetry, body)).statusCode).toBe(400);
    }

    // Luis's own budget (a fresh session): the 31st request in a minute is refused.
    const statuses: number[] = [];
    for (let i = 0; i <= TELEMETRY_RATE_PER_MINUTE; i++) {
      statuses.push((await post(luis, API_PATHS.telemetry, { samples: [sample] })).statusCode);
    }
    expect(statuses.slice(0, TELEMETRY_RATE_PER_MINUTE).every((s) => s === 204)).toBe(true);
    expect(statuses.at(-1)).toBe(429);
    // Ana still has her own budget.
    expect((await post(ana, API_PATHS.telemetry, { samples: [sample] })).statusCode).toBe(204);
  });
});

describe('client product events: room_meet_opened (E6-S2, O6)', () => {
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
      actorId: actorIdOf(SECRET, ana.user.id),
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

describe('per-session limits cannot be dodged with made-up cookies (E8-S2)', () => {
  let t: TestApp;

  beforeEach(async () => {
    t = await buildTestApp({ env: { RATE_LIMIT_PER_MINUTE: '5' } });
  });

  afterEach(async () => {
    await t.app.close();
  });

  it.each([API_PATHS.telemetry, API_PATHS.feedback])(
    'keeps the per-IP limit on %s whatever session cookie is sent',
    async (url) => {
      const statuses: number[] = [];
      for (let i = 0; i < 7; i++) {
        const response = await t.app.inject({
          method: 'POST',
          url,
          // A different made-up session token each time: it used to get a budget of its own.
          headers: { 'x-plaza-client': 'test', cookie: `plaza_sid=forged-${String(i)}` },
          payload: { samples: [], message: 'x' },
        });
        statuses.push(response.statusCode);
      }
      expect(statuses).toEqual([401, 401, 401, 401, 401, 429, 429]);
    },
  );
});
