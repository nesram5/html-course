import {
  PROTOCOL_VERSION,
  REALTIME_PATH,
  type ChatMessageEvent,
  type SpaceSnapshot,
  type WorldDelta,
} from '@plaza/shared';
import { beforeEach, describe, expect, expectTypeOf, it, vi } from 'vitest';

import { createConnectionStore, type ConnectionStore } from '../realtime/connection-store';
import {
  RealtimeClient,
  RealtimeRequestError,
  createPlazaSocket,
  parseServerEvent,
} from '../realtime/realtime-client';
import { FakeSocket } from './fake-socket';
import { testDelta, testPlayer, testSnapshot } from './fixtures';

const io = vi.hoisted(() => vi.fn());
vi.mock('socket.io-client', () => ({ io }));

let socket: FakeSocket;
let store: ConnectionStore;
let onInvalidEvent: ReturnType<typeof vi.fn<(event: string, error: unknown) => void>>;
let client: RealtimeClient;

beforeEach(() => {
  socket = new FakeSocket();
  store = createConnectionStore();
  onInvalidEvent = vi.fn<(event: string, error: unknown) => void>();
  client = new RealtimeClient({
    createSocket: () => socket.asSocket(),
    store,
    ackTimeoutMs: 1234,
    onInvalidEvent,
  });
});

function connect(): void {
  client.connect();
  socket.accept();
}

async function rejection(promise: Promise<unknown>): Promise<RealtimeRequestError> {
  const error: unknown = await promise.then(
    () => null,
    (reason: unknown) => reason,
  );
  if (!(error instanceof RealtimeRequestError)) throw new Error('expected a RealtimeRequestError');
  return error;
}

describe('createPlazaSocket', () => {
  it('opens one same-origin WebSocket at /realtime with the session cookie, on demand', () => {
    createPlazaSocket();

    expect(io).toHaveBeenCalledWith({
      path: REALTIME_PATH,
      transports: ['websocket'],
      withCredentials: true,
      autoConnect: false,
      reconnectionDelay: 500,
      reconnectionDelayMax: 5000,
    });
  });
});

describe('RealtimeClient connection status (connectionStore)', () => {
  it('goes connecting → connected and creates a single socket', () => {
    const createSocket = vi.fn(() => socket.asSocket());
    client = new RealtimeClient({ createSocket, store });
    expect(store.getState().status).toBe('disconnected');

    client.connect();
    expect(store.getState().status).toBe('connecting');
    socket.accept();
    client.connect();

    expect(store.getState()).toMatchObject({ status: 'connected', error: null });
    expect(client.connected).toBe(true);
    expect(createSocket).toHaveBeenCalledTimes(1);
    expect(socket.connectCalls).toBe(1);
  });

  it('shows reconnecting after a network drop and calls onConnect again when it is back', () => {
    const onConnect = vi.fn();
    client.onConnect(onConnect);
    connect();

    socket.drop();
    expect(store.getState().status).toBe('reconnecting');
    socket.accept();

    expect(store.getState().status).toBe('connected');
    expect(onConnect).toHaveBeenCalledTimes(2);
  });

  it('keeps retrying on temporary connection errors', () => {
    client.connect();
    socket.failTemporarily();

    expect(store.getState().status).toBe('connecting');
  });

  it('is disconnected, with the code, when the handshake is refused', () => {
    client.connect();
    socket.refuse({ code: 'UNAUTHORIZED', message: 'Authentication required' });

    expect(store.getState()).toMatchObject({ status: 'disconnected', error: 'UNAUTHORIZED' });
  });

  it('is disconnected without retries when the server or the client closes the socket', () => {
    connect();
    socket.closeFromServer();
    expect(store.getState().status).toBe('disconnected');

    client.connect();
    socket.accept();
    client.disconnect();
    expect(store.getState().status).toBe('disconnected');
    expect(socket.active).toBe(false);
  });
});

describe('RealtimeClient incoming events', () => {
  it('delivers valid events to typed listeners until they unsubscribe', () => {
    const listener = vi.fn((payload: WorldDelta) => payload);
    const off = client.on('world:delta', listener);
    connect();
    const delta = testDelta({ moved: [{ userId: 'user-2', x: 2, y: 3, dir: 'right' }] });

    socket.serverEmit('world:delta', delta);
    off();
    socket.serverEmit('world:delta', delta);

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith(delta);
    expect(client.listenerCount()).toBe(0);
  });

  it('drops and reports events that do not match the shared schema', () => {
    const listener = vi.fn();
    client.on('world:delta', listener);
    client.on('space:kicked', listener);
    connect();

    socket.serverEmit('world:delta', { moved: [{ userId: 'user-2', x: -1, y: 0, dir: 'up' }] });
    socket.serverEmit('space:kicked', { reason: 'BORED' });
    socket.serverEmit('not:an-event', {});

    expect(listener).not.toHaveBeenCalled();
    expect(onInvalidEvent.mock.calls.map(([event]) => event)).toEqual([
      'world:delta',
      'space:kicked',
      'not:an-event',
    ]);
  });

  it('refuses a snapshot of another protocol version', () => {
    expect(parseServerEvent('space:snapshot', testSnapshot()).ok).toBe(true);
    expect(
      parseServerEvent('space:snapshot', { ...testSnapshot(), v: PROTOCOL_VERSION + 1 }).ok,
    ).toBe(false);
  });

  it('types listeners with the shared ServerToClientEvents', () => {
    client.on('world:delta', (payload) => {
      expectTypeOf(payload).toEqualTypeOf<WorldDelta>();
    });
    client.on('player:correct', (payload) => {
      expectTypeOf(payload).toEqualTypeOf<{ x: number; y: number }>();
    });
    // @ts-expect-error unknown server event
    client.on('world:unknown', () => undefined);
    expectTypeOf(client.join).returns.resolves.toEqualTypeOf<SpaceSnapshot>();
    expectTypeOf(client.sendChat).returns.resolves.toEqualTypeOf<ChatMessageEvent>();
  });
});

describe('RealtimeClient.join', () => {
  it('sends space:join with the protocol version and resolves the snapshot', async () => {
    connect();

    const joined = client.join('space-1');
    const ack = socket.lastAck('space:join');
    ack.resolve({ ok: true, data: testSnapshot() });

    await expect(joined).resolves.toEqual(testSnapshot());
    expect(ack.payload).toEqual({ v: PROTOCOL_VERSION, spaceId: 'space-1' });
    expect(ack.timeoutMs).toBe(1234);
  });

  it.each(['NOT_A_MEMBER', 'SPACE_FULL'] as const)('rejects with %s', async (code) => {
    connect();

    const joined = client.join('space-1');
    socket.lastAck('space:join').resolve({ ok: false, error: { code, message: 'no' } });

    expect((await rejection(joined)).code).toBe(code);
  });

  it('fails with NETWORK_ERROR when not connected or when the ack times out', async () => {
    expect((await rejection(client.join('space-1'))).code).toBe('NETWORK_ERROR');
    expect(socket.acks).toHaveLength(0);

    connect();
    const joined = client.join('space-1');
    socket.lastAck('space:join').reject(new Error('operation has timed out'));

    expect((await rejection(joined)).code).toBe('NETWORK_ERROR');
  });

  it('detects a server with another protocol version and reports malformed answers', async () => {
    connect();

    const newer = client.join('space-1');
    socket.lastAck('space:join').resolve({ ok: true, data: { ...testSnapshot(), v: 99 } });
    expect((await rejection(newer)).code).toBe('PROTOCOL_MISMATCH');

    const broken = client.join('space-1');
    socket
      .lastAck('space:join')
      .resolve({ ok: true, data: { players: 'nope', v: PROTOCOL_VERSION } });
    expect((await rejection(broken)).code).toBe('INTERNAL');
    expect(onInvalidEvent).toHaveBeenCalledWith('space:join (ack)', expect.anything());
  });
});

describe('RealtimeClient outgoing events', () => {
  it('sends player:move with the protocol version only while connected (no replay)', () => {
    expect(client.move({ x: 2, y: 1, dir: 'right' })).toBe(false);
    connect();
    expect(client.move({ x: 2, y: 1, dir: 'right' })).toBe(true);
    socket.drop();
    expect(client.move({ x: 3, y: 1, dir: 'right' })).toBe(false);

    expect(socket.sent).toEqual([
      { event: 'player:move', payload: { v: PROTOCOL_VERSION, x: 2, y: 1, dir: 'right' } },
    ]);
  });

  it('stamps every other client event with the protocol version', async () => {
    connect();

    client.setStatus('busy');
    client.setAway(true);
    client.react('👋');
    client.gotoDesk();
    const chat = client.sendChat('hola');
    const message = {
      id: 'm1',
      authorId: 'user-1',
      body: 'hola',
      createdAt: '2026-09-27T10:00:00.000Z',
    };
    socket.lastAck('chat:send').resolve({ ok: true, data: message });
    const ring = client.ring('user-2');
    socket.lastAck('ring:send').resolve({ ok: true, data: null });

    expect(socket.sent).toEqual([
      { event: 'player:status', payload: { v: PROTOCOL_VERSION, status: 'busy' } },
      { event: 'player:away', payload: { v: PROTOCOL_VERSION, away: true } },
      { event: 'reaction', payload: { v: PROTOCOL_VERSION, emoji: '👋' } },
      { event: 'desk:goto', payload: { v: PROTOCOL_VERSION } },
    ]);
    expect(socket.lastAck('chat:send').payload).toEqual({ v: PROTOCOL_VERSION, body: 'hola' });
    expect(socket.lastAck('ring:send').payload).toEqual({
      v: PROTOCOL_VERSION,
      toUserId: 'user-2',
    });
    await expect(chat).resolves.toEqual(message);
    await expect(ring).resolves.toBeUndefined();
  });

  it('rejects a ring in cooldown with its code', async () => {
    connect();

    const ring = client.ring(testPlayer().userId);
    socket
      .lastAck('ring:send')
      .resolve({ ok: false, error: { code: 'RING_COOLDOWN', message: '' } });

    expect((await rejection(ring)).code).toBe('RING_COOLDOWN');
  });
});
