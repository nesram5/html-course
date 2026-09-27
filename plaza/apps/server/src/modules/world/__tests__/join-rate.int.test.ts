import { SPACE_JOIN_BURST, SPACE_JOIN_WINDOW_MS } from '@plaza/shared';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { resetDatabase } from '../../../test/db.js';
import { ManualTimers } from '../../../test/manual-timers.js';
import { RealtimeHarness } from '../../../test/realtime.js';
import type { TestUser } from '../../../test/session.js';

describe('world module: space:join rate limit (E4 follow-up)', () => {
  const timers = new ManualTimers();
  const harness = new RealtimeHarness({
    timers,
    joinLimit: { burst: SPACE_JOIN_BURST, windowMs: SPACE_JOIN_WINDOW_MS },
  });
  let spaceId: string;
  let ana: TestUser;
  let luis: TestUser;

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
    spaceId = (await harness.createSpace(ana, [luis])).id;
  });

  afterEach(() => {
    harness.reset();
  });

  it('accepts 5 joins per person in 10 s, counted across sockets, then answers RATE_LIMITED', async () => {
    const first = await harness.open(ana);
    const acks = [];
    for (let i = 0; i < SPACE_JOIN_BURST; i++) acks.push(await harness.join(first, spaceId));
    const secondTab = await harness.open(ana);
    const other = await harness.open(luis);

    const limited = await harness.join(secondTab, spaceId);
    const someoneElse = await harness.join(other, spaceId);

    expect(acks.every((ack) => ack.ok)).toBe(true);
    expect(limited).toMatchObject({ ok: false, error: { code: 'RATE_LIMITED' } });
    // Refused before entering: the first tab was not replaced.
    expect(harness.inbox(first)['space:kicked']).toEqual([]);
    expect(someoneElse.ok).toBe(true);
  });

  it('lets the person join again once the window refills', async () => {
    const client = await harness.open(ana);
    for (let i = 0; i < SPACE_JOIN_BURST; i++) await harness.join(client, spaceId);
    expect(await harness.join(client, spaceId)).toMatchObject({
      ok: false,
      error: { code: 'RATE_LIMITED' },
    });

    timers.advance(SPACE_JOIN_WINDOW_MS / SPACE_JOIN_BURST);

    expect((await harness.join(client, spaceId)).ok).toBe(true);
  });
});
