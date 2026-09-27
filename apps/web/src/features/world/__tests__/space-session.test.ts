import { PROTOCOL_VERSION, type SpaceSnapshot } from '@bululu/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { EventBus } from '../bridge/event-bus';
import { createConnectionStore } from '../realtime/connection-store';
import { RealtimeClient } from '../realtime/realtime-client';
import { SpaceSession, createSessionStore, type SessionStore } from '../realtime/space-session';
import { createWorldStore, type WorldStore } from '../store/world-store';
import { FakeSocket } from './fake-socket';
import { testDelta, testPlayer, testSnapshot } from './fixtures';

let socket: FakeSocket;
let client: RealtimeClient;
let events: EventBus;
let world: WorldStore;
let store: SessionStore;
let session: SpaceSession;
let snapshots: SpaceSnapshot[];

function flush(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}

function joins(): number {
  return socket.acks.filter((ack) => ack.event === 'space:join').length;
}

function moves(): unknown[] {
  return socket.sent.filter((sent) => sent.event === 'player:move').map((sent) => sent.payload);
}

/** Connected, map drawn and joined with `snapshot`. */
async function joined(snapshot = testSnapshot()): Promise<void> {
  session.start();
  socket.accept();
  world.getState().setLoad({ kind: 'ready' });
  socket.lastAck('space:join').resolve({ ok: true, data: snapshot });
  await flush();
}

beforeEach(() => {
  socket = new FakeSocket();
  client = new RealtimeClient({
    createSocket: () => socket.asSocket(),
    store: createConnectionStore(),
    onInvalidEvent: vi.fn(),
  });
  events = new EventBus();
  world = createWorldStore();
  store = createSessionStore();
  session = new SpaceSession({
    spaceId: 'space-1',
    client,
    events,
    world,
    store,
    tabId: 'tab-test-1',
  });
  snapshots = [];
  events.on('world:snapshot', (snapshot) => {
    snapshots.push(snapshot);
  });
});

describe('SpaceSession: joining (E4-S1)', () => {
  it('joins once connected AND the map is drawn, then hands the snapshot to the scene', async () => {
    session.start();
    expect(client.store.getState().status).toBe('connecting');
    socket.accept();
    expect(joins()).toBe(0);

    world.getState().setLoad({ kind: 'loading', progress: 0.5 });
    expect(joins()).toBe(0);
    world.getState().setLoad({ kind: 'ready' });

    expect(session.state).toEqual({ kind: 'joining' });
    expect(socket.lastAck('space:join').payload).toEqual({
      v: PROTOCOL_VERSION,
      spaceId: 'space-1',
      tabId: 'tab-test-1',
      takeover: true,
    });
    socket.lastAck('space:join').resolve({ ok: true, data: testSnapshot() });
    await flush();

    expect(session.state).toEqual({ kind: 'joined' });
    expect(snapshots).toEqual([testSnapshot()]);
  });

  it('also joins when the map is ready before the connection', () => {
    world.getState().setLoad({ kind: 'ready' });
    session.start();
    expect(joins()).toBe(0);

    socket.accept();

    expect(joins()).toBe(1);
  });

  it.each(['NOT_A_MEMBER', 'SPACE_FULL'] as const)(
    'fails with %s and joins again on retry',
    async (code) => {
      session.start();
      socket.accept();
      world.getState().setLoad({ kind: 'ready' });
      socket.lastAck('space:join').resolve({ ok: false, error: { code, message: 'no' } });
      await flush();

      expect(session.state).toEqual({ kind: 'failed', code });
      session.retry();
      expect(joins()).toBe(2);
    },
  );

  it('fails with the handshake error when the connection is refused', () => {
    session.start();
    socket.refuse({ code: 'UNAUTHORIZED', message: 'no' });

    expect(session.state).toEqual({ kind: 'failed', code: 'UNAUTHORIZED' });
  });

  it('fails on PROTOCOL_MISMATCH errors from the server', async () => {
    await joined();

    socket.serverEmit('error', { code: 'PROTOCOL_MISMATCH', message: 'reload' });

    expect(session.state).toEqual({ kind: 'failed', code: 'PROTOCOL_MISMATCH' });
  });

  it('joins again when the map is redrawn (new game)', async () => {
    await joined();

    world.getState().setLoad({ kind: 'loading', progress: 0 });
    world.getState().setLoad({ kind: 'ready' });

    expect(joins()).toBe(2);
  });
});

describe('SpaceSession: movement (E4-S3, E4-S5)', () => {
  it('sends local steps as player:move only while joined', async () => {
    session.start();
    socket.accept();
    events.emit('local:step', { x: 1, y: 2, dir: 'down' });
    expect(moves()).toEqual([]);

    world.getState().setLoad({ kind: 'ready' });
    socket.lastAck('space:join').resolve({ ok: true, data: testSnapshot() });
    await flush();
    events.emit('local:step', { x: 1, y: 2, dir: 'down' });

    expect(moves()).toEqual([{ v: PROTOCOL_VERSION, x: 1, y: 2, dir: 'down' }]);
  });

  it('forwards world:delta and player:correct to the scene', async () => {
    const deltas = vi.fn();
    const corrections = vi.fn();
    events.on('world:delta', deltas);
    events.on('player:correct', corrections);
    await joined();
    const delta = testDelta({ moved: [{ userId: 'user-2', x: 2, y: 3, dir: 'right' }] });

    socket.serverEmit('world:delta', delta);
    socket.serverEmit('player:correct', { x: 1, y: 1 });
    socket.serverEmit('player:correct', { x: -4, y: 1 });

    expect(deltas).toHaveBeenCalledWith(delta);
    expect(corrections).toHaveBeenCalledTimes(1);
    expect(corrections).toHaveBeenCalledWith({ x: 1, y: 1 });
  });

  it('keeps the people of the space in the world store (tiles and inConversation)', async () => {
    await joined();
    expect(world.getState().selfId).toBe('user-1');
    expect([...world.getState().players.keys()]).toEqual(['user-2']);

    socket.serverEmit(
      'world:delta',
      testDelta({
        joined: [testPlayer({ userId: 'user-3', displayName: 'Eva', x: 4, y: 3 })],
        moved: [{ userId: 'user-2', x: 2, y: 3, dir: 'right' }],
        changed: [
          { userId: 'user-2', inConversation: true },
          { userId: 'user-1', inConversation: true },
        ],
      }),
    );
    expect(world.getState().players.get('user-2')).toMatchObject({
      x: 2,
      y: 3,
      dir: 'right',
      inConversation: true,
    });
    expect(world.getState().players.get('user-3')).toMatchObject({ x: 4, y: 3 });
    // The local person is not one of "the others".
    expect(world.getState().players.has('user-1')).toBe(false);

    const before = world.getState().players;
    socket.serverEmit('world:delta', testDelta());
    expect(world.getState().players).toBe(before);

    socket.serverEmit('world:delta', testDelta({ left: ['user-2'] }));
    expect([...world.getState().players.keys()]).toEqual(['user-3']);

    world.getState().reset();
    expect(world.getState().players.size).toBe(0);
    expect(world.getState().selfId).toBeNull();
  });

  it('applies snapshots pushed by the server for this space only', async () => {
    await joined();

    socket.serverEmit('space:snapshot', testSnapshot({ players: [] }));
    socket.serverEmit('space:snapshot', testSnapshot({ spaceId: 'space-2' }));

    expect(snapshots).toEqual([testSnapshot(), testSnapshot({ players: [] })]);
  });
});

describe('SpaceSession: reconnection (E4-S6)', () => {
  it('stops sending while reconnecting, then re-joins and applies the fresh snapshot', async () => {
    await joined();
    const deltas = vi.fn();
    events.on('world:delta', deltas);

    socket.drop();
    expect(client.store.getState().status).toBe('reconnecting');
    events.emit('local:step', { x: 2, y: 1, dir: 'right' });
    socket.serverEmit('world:delta', testDelta({ left: ['user-2'] }));
    expect(moves()).toEqual([]);
    expect(deltas).not.toHaveBeenCalled();

    socket.accept();
    const fresh = testSnapshot({
      self: testPlayer({ userId: 'user-1', x: 1, y: 3 }),
      players: [testPlayer({ userId: 'user-3', displayName: 'Eva' })],
    });
    socket.lastAck('space:join').resolve({ ok: true, data: fresh });
    await flush();

    expect(joins()).toBe(2);
    expect(session.state).toEqual({ kind: 'joined' });
    expect(snapshots.at(-1)).toEqual(fresh);
  });

  it('rejoins without taking over, and steps aside when another tab holds the avatar', async () => {
    await joined();

    // Offline long enough for the person to open the space in another tab.
    socket.drop();
    socket.accept();
    const rejoin = socket.lastAck('space:join');
    expect(rejoin.payload).toEqual({
      v: PROTOCOL_VERSION,
      spaceId: 'space-1',
      tabId: 'tab-test-1',
      takeover: false,
    });
    rejoin.resolve({ ok: false, error: { code: 'SESSION_REPLACED', message: 'other tab' } });
    await flush();

    expect(session.state).toEqual({ kind: 'kicked', reason: 'SESSION_REPLACED' });
    expect(socket.active).toBe(false);

    // "Usar Bululu aquí": an explicit takeover.
    session.retry();
    socket.accept();
    expect(socket.lastAck('space:join').payload).toMatchObject({ takeover: true });
  });

  it('ignores the answer of a join sent before the connection dropped', async () => {
    session.start();
    socket.accept();
    world.getState().setLoad({ kind: 'ready' });
    const stale = socket.lastAck('space:join');

    socket.drop();
    socket.accept();
    stale.resolve({ ok: true, data: testSnapshot({ players: [] }) });
    await flush();
    expect(snapshots).toEqual([]);
    expect(session.state).toEqual({ kind: 'joining' });

    socket.lastAck('space:join').resolve({ ok: true, data: testSnapshot() });
    await flush();
    expect(snapshots).toEqual([testSnapshot()]);
  });
});

describe('SpaceSession: kicked', () => {
  it('SESSION_REPLACED: stops, does not reconnect, and takes over on retry', async () => {
    await joined();

    socket.serverEmit('space:kicked', { reason: 'SESSION_REPLACED' });
    socket.closeFromServer();

    expect(session.state).toEqual({ kind: 'kicked', reason: 'SESSION_REPLACED' });
    expect(socket.active).toBe(false);
    world.getState().setLoad({ kind: 'loading', progress: 0 });
    world.getState().setLoad({ kind: 'ready' });
    expect(joins()).toBe(1);

    session.retry();
    expect(socket.connectCalls).toBe(2);
    socket.accept();

    expect(joins()).toBe(2);
    expect(session.state).toEqual({ kind: 'joining' });
  });

  it('REMOVED: keeps the reason for the page to explain it', async () => {
    await joined();

    socket.serverEmit('space:kicked', { reason: 'REMOVED' });

    expect(session.state).toEqual({ kind: 'kicked', reason: 'REMOVED' });
    expect(client.connected).toBe(false);
  });
});

describe('SpaceSession: closed by the server without a kick', () => {
  it('offers to retry instead of leaving a frozen office, and joins again on retry', async () => {
    await joined();

    socket.closeFromServer();

    expect(session.state).toEqual({ kind: 'failed', code: 'NETWORK_ERROR' });
    events.emit('local:step', { x: 1, y: 2, dir: 'down' });
    expect(moves()).toEqual([]);
    session.retry();
    socket.accept();
    expect(joins()).toBe(2);
    expect(session.state).toEqual({ kind: 'joining' });
  });
});

describe('SpaceSession: lifecycle', () => {
  it('stop() disconnects and removes every listener', async () => {
    const baseline = events.listenerCount();
    await joined();

    session.stop();

    expect(client.connected).toBe(false);
    expect(client.store.getState().status).toBe('disconnected');
    expect(client.listenerCount()).toBe(0);
    expect(events.listenerCount()).toBe(baseline);
    expect(session.state).toEqual({ kind: 'idle' });
  });
});
