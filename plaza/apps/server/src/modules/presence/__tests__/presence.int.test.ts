import { PROTOCOL_VERSION, RING_COOLDOWN_MS, type Ack } from '@plaza/shared';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { resetDatabase } from '../../../test/db.js';
import { ManualTimers } from '../../../test/manual-timers.js';
import { RealtimeHarness, type TestClient } from '../../../test/realtime.js';
import type { TestUser } from '../../../test/session.js';

describe('presence module: status, away and ring (E7-S1, E7-S5)', () => {
  const timers = new ManualTimers();
  const harness = new RealtimeHarness({ timers });
  let spaceId: string;
  let ana: TestUser;
  let luis: TestUser;
  let eva: TestUser;

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
    eva = await harness.signIn('eva@acme.com', 'Eva');
    spaceId = (await harness.createSpace(ana, [luis, eva])).id;
  });

  afterEach(() => {
    harness.reset();
  });

  function status(client: TestClient, value: 'available' | 'busy'): void {
    client.emit('player:status', { v: PROTOCOL_VERSION, status: value });
  }

  function away(client: TestClient, value: boolean): void {
    client.emit('player:away', { v: PROTOCOL_VERSION, away: value });
  }

  function ring(client: TestClient, toUserId: string): Promise<Ack<null>> {
    return client.emitWithAck('ring:send', { v: PROTOCOL_VERSION, toUserId });
  }

  /** `player:status` writes to the database first: wait until the runtime has it. */
  async function statusApplied(userId: string, value: 'available' | 'busy'): Promise<void> {
    await vi.waitFor(() => {
      expect(harness.world.store.get(spaceId)?.get(userId)?.status).toBe(value);
    });
  }

  async function storedStatus(userId: string): Promise<string | undefined> {
    const membership = await harness.testApp.container.db.membership.findUnique({
      where: { userId_spaceId: { userId, spaceId } },
    });
    return membership?.status;
  }

  describe('player:status', () => {
    it('broadcasts the new status in world:delta.changed and stores it in Membership.status', async () => {
      const me = await harness.enter(ana, spaceId);
      const other = await harness.enter(luis, spaceId);
      await harness.tick(spaceId, me.client, other.client);
      harness.inbox(other.client)['world:delta'].length = 0;

      status(me.client, 'busy');
      await statusApplied(ana.user.id, 'busy');
      await harness.tick(spaceId, me.client, other.client);

      // Both spawn within 3 tiles: being busy also ends their hallway conversation (E5-S2).
      const changed = [
        { userId: ana.user.id, status: 'busy', inConversation: false },
        { userId: luis.user.id, inConversation: false },
      ];
      expect(harness.inbox(other.client)['world:delta']).toEqual([
        { moved: [], joined: [], left: [], changed },
      ]);
      // The person gets their own change too (the dot over their avatar).
      expect(harness.inbox(me.client)['world:delta'].at(-1)?.changed).toEqual(changed);
      expect(await storedStatus(ana.user.id)).toBe('busy');
    });

    it('restores the chosen status on the next visit (reload)', async () => {
      const first = await harness.enter(ana, spaceId);
      status(first.client, 'busy');
      await statusApplied(ana.user.id, 'busy');
      first.client.close();
      await vi.waitFor(() => {
        expect(harness.world.store.get(spaceId)?.has(ana.user.id) ?? false).toBe(false);
      });

      const again = await harness.enter(ana, spaceId);
      const other = await harness.enter(luis, spaceId);

      expect(again.snapshot.self.status).toBe('busy');
      expect(other.snapshot.players.find((p) => p.userId === ana.user.id)?.status).toBe('busy');
    });

    it('refuses invalid statuses and changes before space:join', async () => {
      const me = await harness.enter(ana, spaceId);
      const outside = await harness.open(luis);

      me.client.emit('player:status', { v: PROTOCOL_VERSION, status: 'away' as 'busy' });
      status(outside, 'busy');

      await vi.waitFor(() => {
        expect(harness.inbox(me.client).error.map((e) => e.code)).toEqual(['VALIDATION_ERROR']);
        expect(harness.inbox(outside).error.map((e) => e.code)).toEqual(['NOT_IN_SPACE']);
      });
      expect(await storedStatus(ana.user.id)).toBe('available');
      expect(await storedStatus(luis.user.id)).toBe('available');
    });

    it('rate-limits status and away changes per socket', async () => {
      const me = await harness.enter(ana, spaceId);

      for (let i = 0; i < 12; i++) away(me.client, i % 2 === 0);
      await harness.barrier(spaceId, me.client);

      expect(harness.inbox(me.client).error.map((e) => e.code)).toEqual([
        'RATE_LIMITED',
        'RATE_LIMITED',
      ]);
    });
  });

  describe('player:away', () => {
    it('broadcasts away and back without touching the chosen status', async () => {
      const me = await harness.enter(ana, spaceId);
      const other = await harness.enter(luis, spaceId);
      await harness.tick(spaceId, me.client, other.client);
      harness.inbox(other.client)['world:delta'].length = 0;

      away(me.client, true);
      await harness.barrier(spaceId, me.client);
      await harness.tick(spaceId, me.client, other.client);
      away(me.client, false);
      await harness.barrier(spaceId, me.client);
      await harness.tick(spaceId, me.client, other.client);

      expect(harness.inbox(other.client)['world:delta'].map((d) => d.changed)).toEqual([
        [{ userId: ana.user.id, away: true }],
        [{ userId: ana.user.id, away: false }],
      ]);
      expect(await storedStatus(ana.user.id)).toBe('available');
    });

    it('sends nothing when away does not change', async () => {
      const me = await harness.enter(ana, spaceId);
      const other = await harness.enter(luis, spaceId);
      await harness.tick(spaceId, me.client, other.client);
      harness.inbox(other.client)['world:delta'].length = 0;

      away(me.client, false);
      await harness.barrier(spaceId, me.client);
      await harness.tick(spaceId, other.client);

      expect(harness.inbox(other.client)['world:delta']).toEqual([]);
    });
  });

  describe('ring:send (RN-11)', () => {
    it('delivers ring:received with the caller name, only to the target', async () => {
      const sam = await harness.enter(ana, spaceId);
      const mary = await harness.enter(luis, spaceId);
      const bystander = await harness.enter(eva, spaceId);

      const ack = await ring(sam.client, luis.user.id);
      await harness.barrier(spaceId, mary.client, bystander.client);

      expect(ack).toEqual({ ok: true, data: null });
      expect(harness.inbox(mary.client)['ring:received']).toEqual([
        { fromUserId: ana.user.id, fromDisplayName: 'Ana', silent: false },
      ]);
      expect(harness.inbox(bystander.client)['ring:received']).toEqual([]);
    });

    it('refuses a second ring to the same person within 30 s with RING_COOLDOWN', async () => {
      const sam = await harness.enter(ana, spaceId);
      const mary = await harness.enter(luis, spaceId);
      await harness.enter(eva, spaceId);

      expect((await ring(sam.client, luis.user.id)).ok).toBe(true);
      timers.advance(RING_COOLDOWN_MS - 1);
      const tooSoon = await ring(sam.client, luis.user.id);
      // Another target, or another caller, is not affected.
      const otherTarget = await ring(sam.client, eva.user.id);
      timers.advance(1);
      const later = await ring(sam.client, luis.user.id);
      await harness.barrier(spaceId, mary.client);

      expect(tooSoon).toMatchObject({ ok: false, error: { code: 'RING_COOLDOWN' } });
      expect(otherTarget.ok).toBe(true);
      expect(later.ok).toBe(true);
      expect(harness.inbox(mary.client)['ring:received']).toHaveLength(2);
    });

    it('limits rings per person across connections, whatever the target', async () => {
      const first = await harness.enter(ana, spaceId);
      await harness.enter(luis, spaceId);
      await harness.enter(eva, spaceId);

      // Three in a row are fine (the cooldown answers the repeated target)…
      const burst = [
        await ring(first.client, luis.user.id),
        await ring(first.client, eva.user.id),
        await ring(first.client, luis.user.id),
      ];
      // …then a reconnection does not buy more.
      const second = await harness.enter(ana, spaceId);
      const flood = await ring(second.client, eva.user.id);
      timers.advance(1000);
      const later = await ring(second.client, 'nobody');

      expect(burst.map((ack) => (ack.ok ? 'ok' : ack.error.code))).toEqual([
        'ok',
        'ok',
        'RING_COOLDOWN',
      ]);
      expect(flood).toMatchObject({ ok: false, error: { code: 'RATE_LIMITED' } });
      expect(later).toMatchObject({ ok: false, error: { code: 'UNKNOWN_USER' } });
    });

    it('keeps the 30 s cooldown after the caller reconnects', async () => {
      const first = await harness.enter(ana, spaceId);
      await harness.enter(luis, spaceId);
      expect((await ring(first.client, luis.user.id)).ok).toBe(true);

      const second = await harness.enter(ana, spaceId);
      timers.advance(5000);

      expect(await ring(second.client, luis.user.id)).toMatchObject({
        ok: false,
        error: { code: 'RING_COOLDOWN' },
      });
    });

    it('rings busy people silently', async () => {
      const sam = await harness.enter(ana, spaceId);
      const mary = await harness.enter(luis, spaceId);
      status(mary.client, 'busy');
      await statusApplied(luis.user.id, 'busy');

      await ring(sam.client, luis.user.id);
      await harness.barrier(spaceId, mary.client);

      expect(harness.inbox(mary.client)['ring:received']).toEqual([
        { fromUserId: ana.user.id, fromDisplayName: 'Ana', silent: true },
      ]);
    });

    it('refuses ringing oneself, people who are not connected and callers outside the space', async () => {
      const sam = await harness.enter(ana, spaceId);
      const outside = await harness.open(eva);

      const self = await ring(sam.client, ana.user.id);
      const offline = await ring(sam.client, luis.user.id);
      const unknown = await ring(sam.client, 'nobody');
      const notJoined = await ring(outside, ana.user.id);

      expect(self).toMatchObject({ ok: false, error: { code: 'VALIDATION_ERROR' } });
      expect(offline).toMatchObject({ ok: false, error: { code: 'UNKNOWN_USER' } });
      expect(unknown).toMatchObject({ ok: false, error: { code: 'UNKNOWN_USER' } });
      expect(notJoined).toMatchObject({ ok: false, error: { code: 'NOT_IN_SPACE' } });
    });
  });
});
