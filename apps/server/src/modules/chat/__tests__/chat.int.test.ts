import { performance } from 'node:perf_hooks';

import {
  API_PATHS,
  apiPath,
  CHAT_HISTORY,
  CHAT_MAX_LEN,
  MessagesResponseSchema,
  PROTOCOL_VERSION,
  type Ack,
  type ChatMessageEvent,
  type ReactionEmoji,
} from '@plaza/shared';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { resetDatabase } from '../../../test/db.js';
import { ManualTimers } from '../../../test/manual-timers.js';
import { RealtimeHarness, type TestClient } from '../../../test/realtime.js';
import type { TestUser } from '../../../test/session.js';

describe('chat module: space chat and reactions (E7-S3, E7-S4)', () => {
  const timers = new ManualTimers();
  const harness = new RealtimeHarness({ timers });
  let spaceId: string;
  let ana: TestUser;
  let luis: TestUser;
  let zoe: TestUser;

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
    zoe = await harness.signIn('zoe@other.com', 'Zoe');
    spaceId = (await harness.createSpace(ana, [luis])).id;
  });

  afterEach(() => {
    harness.reset();
  });

  function send(client: TestClient, body: string): Promise<Ack<ChatMessageEvent>> {
    return client.emitWithAck('chat:send', { v: PROTOCOL_VERSION, body });
  }

  function react(client: TestClient, emoji: ReactionEmoji): void {
    client.emit('reaction', { v: PROTOCOL_VERSION, emoji });
  }

  function history(user: TestUser, id = spaceId) {
    return harness.testApp.app.inject({
      method: 'GET',
      url: apiPath(API_PATHS.messages, { spaceId: id }),
      headers: { cookie: user.cookie },
    });
  }

  describe('chat:send', () => {
    it('stores the message, acks it to the sender and sends it to everyone else', async () => {
      const me = await harness.enter(ana, spaceId);
      const other = await harness.enter(luis, spaceId);

      const sentAt = performance.now();
      const delivered = new Promise<number>((resolve) => {
        other.client.once('chat:message', () => {
          resolve(performance.now());
        });
      });
      const ack = await send(me.client, '  Hola equipo  ');
      // Broadcast at once, not on the next tick: well under the 300 ms of E7-S3.
      expect((await delivered) - sentAt).toBeLessThan(300);
      await harness.barrier(spaceId, me.client, other.client);

      if (!ack.ok) throw new Error(ack.error.code);
      expect(ack.data).toMatchObject({ authorId: ana.user.id, body: 'Hola equipo' });
      expect(harness.inbox(other.client)['chat:message']).toEqual([ack.data]);
      // The sender already has it from the ack: no echo.
      expect(harness.inbox(me.client)['chat:message']).toEqual([]);
      const stored = await harness.testApp.container.db.chatMessage.findMany();
      expect(stored.map((m) => [m.id, m.spaceId, m.body])).toEqual([
        [ack.data.id, spaceId, 'Hola equipo'],
      ]);
    });

    it(`refuses empty messages and messages over ${String(CHAT_MAX_LEN)} characters`, async () => {
      const me = await harness.enter(ana, spaceId);

      const tooLong = await send(me.client, 'a'.repeat(CHAT_MAX_LEN + 1));
      const blank = await send(me.client, '   ');
      const longest = await send(me.client, 'a'.repeat(CHAT_MAX_LEN));

      expect(tooLong).toMatchObject({ ok: false, error: { code: 'VALIDATION_ERROR' } });
      expect(blank).toMatchObject({ ok: false, error: { code: 'VALIDATION_ERROR' } });
      expect(longest.ok).toBe(true);
      expect(await harness.testApp.container.db.chatMessage.count()).toBe(1);
    });

    it('refuses a NUL character with VALIDATION_ERROR, not an unexpected error', async () => {
      const me = await harness.enter(ana, spaceId);

      const nul = await send(me.client, 'hola\u0000');

      expect(nul).toMatchObject({ ok: false, error: { code: 'VALIDATION_ERROR' } });
      expect(harness.testApp.reporter.captured).toEqual([]);
    });

    it('accepts 5 messages per second and refuses more with RATE_LIMITED', async () => {
      const me = await harness.enter(ana, spaceId);

      const burst = await Promise.all(
        Array.from({ length: 6 }, (_, i) => send(me.client, `mensaje ${String(i)}`)),
      );
      timers.advance(200); // one message back
      const afterWait = await send(me.client, 'otra vez');

      expect(burst.filter((ack) => ack.ok)).toHaveLength(5);
      expect(burst.filter((ack) => !ack.ok)).toEqual([
        { ok: false, error: { code: 'RATE_LIMITED', message: 'At most 5 messages/s' } },
      ]);
      expect(afterWait.ok).toBe(true);
      expect(await harness.testApp.container.db.chatMessage.count()).toBe(6);
    });

    it('keeps the limit per person: a new connection does not refill it', async () => {
      const first = await harness.enter(ana, spaceId);
      const burst = await Promise.all(
        Array.from({ length: 5 }, (_, i) => send(first.client, `mensaje ${String(i)}`)),
      );

      // The same person joins again from a new socket (another tab, a reconnection).
      const second = await harness.enter(ana, spaceId);
      const again = await send(second.client, 'otra vez');

      expect(burst.every((ack) => ack.ok)).toBe(true);
      expect(again).toMatchObject({ ok: false, error: { code: 'RATE_LIMITED' } });
      expect(await harness.testApp.container.db.chatMessage.count()).toBe(5);
    });

    it('refuses messages before space:join with NOT_IN_SPACE', async () => {
      const client = await harness.open(ana);

      const ack = await send(client, 'hola');

      expect(ack).toMatchObject({ ok: false, error: { code: 'NOT_IN_SPACE' } });
    });

    it(`keeps only the last ${String(CHAT_HISTORY)} messages of each space`, async () => {
      const other = (await harness.createSpace(luis, [])).id;
      const db = harness.testApp.container.db;
      const base = Date.UTC(2026, 8, 1);
      await db.chatMessage.createMany({
        data: Array.from({ length: CHAT_HISTORY }, (_, i) => ({
          spaceId,
          authorId: luis.user.id,
          body: `viejo ${String(i)}`,
          createdAt: new Date(base + i * 1000),
        })),
      });
      await db.chatMessage.create({
        data: { spaceId: other, authorId: luis.user.id, body: 'otro espacio' },
      });
      const me = await harness.enter(ana, spaceId);

      const ack = await send(me.client, 'el nuevo');

      const left = await db.chatMessage.findMany({
        where: { spaceId },
        orderBy: { createdAt: 'asc' },
      });
      expect(left).toHaveLength(CHAT_HISTORY);
      expect(left[0]?.body).toBe('viejo 1');
      expect(left.at(-1)?.id).toBe(ack.ok ? ack.data.id : '');
      expect(await db.chatMessage.count({ where: { spaceId: other } })).toBe(1);
    });
  });

  describe('GET /api/spaces/:spaceId/messages', () => {
    it('returns the last 100 messages, oldest first, to members', async () => {
      const db = harness.testApp.container.db;
      const base = Date.UTC(2026, 8, 1);
      await db.chatMessage.createMany({
        data: Array.from({ length: CHAT_HISTORY + 5 }, (_, i) => ({
          spaceId,
          authorId: i === 0 ? null : ana.user.id,
          body: `mensaje ${String(i)}`,
          createdAt: new Date(base + i * 1000),
        })),
      });

      const response = await history(luis);

      expect(response.statusCode).toBe(200);
      const { messages } = MessagesResponseSchema.parse(response.json());
      expect(messages).toHaveLength(CHAT_HISTORY);
      expect(messages[0]).toMatchObject({
        body: 'mensaje 5',
        authorId: ana.user.id,
        createdAt: new Date(base + 5000).toISOString(),
      });
      expect(messages.at(-1)?.body).toBe(`mensaje ${String(CHAT_HISTORY + 4)}`);
    });

    it('answers 404 to people outside the space and 401 without a session', async () => {
      const outsider = await history(zoe);
      const anonymous = await harness.testApp.app.inject({
        method: 'GET',
        url: apiPath(API_PATHS.messages, { spaceId }),
      });

      expect(outsider.statusCode).toBe(404);
      expect(outsider.json()).toMatchObject({ error: { code: 'NOT_A_MEMBER' } });
      expect(anonymous.statusCode).toBe(401);
    });
  });

  describe('reaction', () => {
    it('shows the reaction of a person to everyone in the space, sender included', async () => {
      const me = await harness.enter(ana, spaceId);
      const other = await harness.enter(luis, spaceId);

      react(me.client, '🎉');
      await harness.barrier(spaceId, me.client, other.client);

      const expected = [{ userId: ana.user.id, emoji: '🎉' }];
      expect(harness.inbox(other.client).reaction).toEqual(expected);
      expect(harness.inbox(me.client).reaction).toEqual(expected);
    });

    it('allows 3 reactions per second and refuses other emojis', async () => {
      const me = await harness.enter(ana, spaceId);
      const other = await harness.enter(luis, spaceId);

      for (const emoji of ['❤️', '👍', '😂', '👋'] as const) react(me.client, emoji);
      me.client.emit('reaction', { v: PROTOCOL_VERSION, emoji: '💩' as ReactionEmoji });
      await harness.barrier(spaceId, me.client, other.client);
      timers.advance(1000);
      react(me.client, '👋');
      await harness.barrier(spaceId, me.client, other.client);

      expect(harness.inbox(other.client).reaction.map((r) => r.emoji)).toEqual([
        '❤️',
        '👍',
        '😂',
        '👋',
      ]);
      await vi.waitFor(() => {
        expect(harness.inbox(me.client).error.map((e) => e.code)).toEqual([
          'RATE_LIMITED',
          'VALIDATION_ERROR',
        ]);
      });
    });
  });
});
