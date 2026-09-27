import {
  API_PATHS,
  apiPath,
  CONVERSATION_MIN_MS,
  TELEMETRY_RATE_PER_MINUTE,
  type SpaceDetailDto,
} from '@plaza/shared';
import { z } from 'zod';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { resetDatabase } from '../../../test/db.js';
import { ManualTimers } from '../../../test/manual-timers.js';
import { RealtimeHarness } from '../../../test/realtime.js';
import type { TestUser } from '../../../test/session.js';
import { actorIdOf } from '../index.js';

const SECRET = 'test-session-secret-at-least-32-characters';
const ROW = 25;

describe('product events and telemetry (E8-S7)', () => {
  const timers = new ManualTimers();
  const harness = new RealtimeHarness({ timers });
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

    expect((await post(luis, url, { name: 'room_meet_opened' })).statusCode).toBe(204);
    expect((await post(eva, url, { name: 'room_meet_opened' })).statusCode).toBe(404);
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
      payload: { name: 'room_meet_opened' },
    });
    expect(unauthenticated.statusCode).toBe(401);

    expect((await stored()).map((event) => event.name)).toEqual(['room_meet_opened']);
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
