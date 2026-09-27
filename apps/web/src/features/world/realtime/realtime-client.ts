import {
  ChatMessageEventSchema,
  ErrorPayloadSchema,
  PROTOCOL_VERSION,
  REALTIME_PATH,
  SERVER_EVENT_SCHEMAS,
  SpaceSnapshotSchema,
  ackSchema,
  type ChatMessageEvent,
  type ClientToServerEvents,
  type Direction,
  type ErrorCode,
  type PresenceStatus,
  type ReactionEmoji,
  type ServerEventName,
  type ServerEventPayload,
  type ServerToClientEvents,
  type SpaceSnapshot,
} from '@bululu/shared';
import { io, type Socket } from 'socket.io-client';
import { z } from 'zod';

import { reportError } from '@/shared/lib/sentry';

import {
  connectionStore as defaultConnectionStore,
  type ConnectionStore,
} from './connection-store';

/** The typed Socket.IO client socket (architecture §9). */
export type BululuClientSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

/** Code of a failed realtime request: a server error code, or no answer from the server. */
export type RealtimeErrorCode = ErrorCode | 'NETWORK_ERROR';

/** A request with an ack (`space:join`, `chat:send`, `ring:send`) failed. */
export class RealtimeRequestError extends Error {
  constructor(
    readonly code: RealtimeErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'RealtimeRequestError';
  }
}

export function isRealtimeRequestError(error: unknown): error is RealtimeRequestError {
  return error instanceof RealtimeRequestError;
}

/** How long a request waits for its ack before failing with `NETWORK_ERROR`. */
export const ACK_TIMEOUT_MS = 10_000;

/** The only Socket.IO socket of the app: same origin, `/realtime`, WebSocket, session cookie. */
export function createBululuSocket(): BululuClientSocket {
  return io({
    path: REALTIME_PATH,
    transports: ['websocket'],
    withCredentials: true,
    autoConnect: false,
    reconnectionDelay: 500,
    reconnectionDelayMax: 5000,
  });
}

export type ParsedServerEvent<E extends ServerEventName> =
  | { readonly ok: true; readonly payload: ServerEventPayload<E> }
  | { readonly ok: false; readonly error: z.ZodError };

/** Validates the payload of a server event with its schema from `@bululu/shared`. */
export function parseServerEvent<E extends ServerEventName>(
  event: E,
  raw: unknown,
): ParsedServerEvent<E> {
  const schema: z.ZodType = SERVER_EVENT_SCHEMAS[event];
  const parsed = schema.safeParse(raw);
  // The schema map is keyed by event, so the parsed value is that event's payload.
  return parsed.success
    ? { ok: true, payload: parsed.data as ServerEventPayload<E> }
    : { ok: false, error: parsed.error };
}

function isServerEventName(event: string): event is ServerEventName {
  return Object.hasOwn(SERVER_EVENT_SCHEMAS, event);
}

function versionOf(raw: unknown): unknown {
  return typeof raw === 'object' && raw !== null && 'v' in raw ? raw.v : undefined;
}

const JoinAckSchema = ackSchema(SpaceSnapshotSchema);
const ChatAckSchema = ackSchema(ChatMessageEventSchema);
const RingAckSchema = ackSchema(z.null());

type Listener<E extends ServerEventName> = (payload: ServerEventPayload<E>) => void;

export interface RealtimeClientOptions {
  readonly createSocket?: () => BululuClientSocket;
  readonly store?: ConnectionStore;
  readonly ackTimeoutMs?: number;
  /** Called with every incoming event that fails validation (dropped). Defaults to Sentry. */
  readonly onInvalidEvent?: (event: string, error: unknown) => void;
}

/**
 * The single point that talks to Socket.IO (architecture §6, E4-S1):
 * - one socket, created lazily on the first `connect()`;
 * - every incoming event is validated with the shared zod schemas before reaching a listener;
 *   invalid ones are dropped and reported;
 * - typed methods for every client event, each stamped with `PROTOCOL_VERSION`;
 * - the connection status lives in the `connectionStore` (Zustand).
 *
 * Fire-and-forget events (`player:move`, ...) are dropped while disconnected instead of being
 * buffered by Socket.IO: stale steps must not be replayed after a reconnection (E4-S6).
 */
export class RealtimeClient {
  private socket: BululuClientSocket | null = null;
  private readonly listeners = new Map<ServerEventName, Set<(payload: never) => void>>();
  private readonly connectListeners = new Set<() => void>();
  private readonly createSocket: () => BululuClientSocket;
  private readonly ackTimeoutMs: number;
  private readonly onInvalidEvent: (event: string, error: unknown) => void;
  readonly store: ConnectionStore;

  constructor(options: RealtimeClientOptions = {}) {
    this.createSocket = options.createSocket ?? createBululuSocket;
    this.store = options.store ?? defaultConnectionStore;
    this.ackTimeoutMs = options.ackTimeoutMs ?? ACK_TIMEOUT_MS;
    this.onInvalidEvent =
      options.onInvalidEvent ??
      ((event, error) => {
        reportError(new Error(`Invalid realtime event "${event}": ${String(error)}`));
      });
  }

  get connected(): boolean {
    return this.socket?.connected ?? false;
  }

  /** Opens the connection (or reopens it after `disconnect()` / a kick). Idempotent. */
  connect(): void {
    const socket = (this.socket ??= this.wire(this.createSocket()));
    if (socket.connected || socket.active) return;
    this.store.getState().setStatus('connecting');
    socket.connect();
  }

  /** Closes the connection on purpose: no automatic reconnection. */
  disconnect(): void {
    this.socket?.disconnect();
    this.store.getState().setStatus('disconnected');
  }

  /**
   * Closes the transport the way a network failure does: Socket.IO then reconnects by itself.
   * Only for the development probes (`window.__bululuWorld`) and E2E tests of E4-S6.
   */
  simulateNetworkDrop(): void {
    this.socket?.io.engine.close();
  }

  /** Listens to a validated server event. Returns the function that removes the listener. */
  on<E extends ServerEventName>(event: E, listener: Listener<E>): () => void {
    let set = this.listeners.get(event);
    if (set === undefined) {
      set = new Set();
      this.listeners.set(event, set);
    }
    set.add(listener);
    return () => {
      set.delete(listener);
    };
  }

  /** Called on every successful (re)connection: the moment to (re)join the space. */
  onConnect(listener: () => void): () => void {
    this.connectListeners.add(listener);
    return () => {
      this.connectListeners.delete(listener);
    };
  }

  /** Listeners currently registered (to check for leaks). */
  listenerCount(): number {
    let total = this.connectListeners.size;
    for (const set of this.listeners.values()) total += set.size;
    return total;
  }

  /**
   * `space:join` → the full state of the space (E4-S1). `options` (the page visit and whether
   * this join may replace another tab) are sent as given; see `SpaceJoinSchema`.
   */
  join(
    spaceId: string,
    options: { readonly tabId?: string; readonly takeover?: boolean } = {},
  ): Promise<SpaceSnapshot> {
    return this.request(
      'space:join',
      (socket, ms) =>
        socket.timeout(ms).emitWithAck('space:join', { v: PROTOCOL_VERSION, spaceId, ...options }),
      JoinAckSchema,
    );
  }

  /** `player:move`: one tile (or a turn in place). Dropped while disconnected. */
  move(step: { readonly x: number; readonly y: number; readonly dir: Direction }): boolean {
    return this.send((socket) =>
      socket.emit('player:move', { v: PROTOCOL_VERSION, x: step.x, y: step.y, dir: step.dir }),
    );
  }

  setStatus(status: PresenceStatus): boolean {
    return this.send((socket) => socket.emit('player:status', { v: PROTOCOL_VERSION, status }));
  }

  setAway(away: boolean): boolean {
    return this.send((socket) => socket.emit('player:away', { v: PROTOCOL_VERSION, away }));
  }

  react(emoji: ReactionEmoji): boolean {
    return this.send((socket) => socket.emit('reaction', { v: PROTOCOL_VERSION, emoji }));
  }

  gotoDesk(): boolean {
    return this.send((socket) => socket.emit('desk:goto', { v: PROTOCOL_VERSION }));
  }

  sendChat(body: string): Promise<ChatMessageEvent> {
    return this.request(
      'chat:send',
      (socket, ms) => socket.timeout(ms).emitWithAck('chat:send', { v: PROTOCOL_VERSION, body }),
      ChatAckSchema,
    );
  }

  async ring(toUserId: string): Promise<void> {
    await this.request(
      'ring:send',
      (socket, ms) =>
        socket.timeout(ms).emitWithAck('ring:send', { v: PROTOCOL_VERSION, toUserId }),
      RingAckSchema,
    );
  }

  private send(emit: (socket: BululuClientSocket) => void): boolean {
    const socket = this.socket;
    if (socket?.connected !== true) return false;
    emit(socket);
    return true;
  }

  private async request<T>(
    event: string,
    emit: (socket: BululuClientSocket, timeoutMs: number) => Promise<unknown>,
    schema: z.ZodType<
      { ok: true; data: T } | { ok: false; error: z.infer<typeof ErrorPayloadSchema> }
    >,
  ): Promise<T> {
    const socket = this.socket;
    if (socket?.connected !== true) {
      throw new RealtimeRequestError('NETWORK_ERROR', `${event}: not connected`);
    }
    let raw: unknown;
    try {
      raw = await emit(socket, this.ackTimeoutMs);
    } catch {
      throw new RealtimeRequestError('NETWORK_ERROR', `${event}: no answer from the server`);
    }
    const parsed = schema.safeParse(raw);
    if (!parsed.success) {
      const data = typeof raw === 'object' && raw !== null && 'data' in raw ? raw.data : undefined;
      if (versionOf(data) !== undefined && versionOf(data) !== PROTOCOL_VERSION) {
        throw new RealtimeRequestError('PROTOCOL_MISMATCH', `${event}: protocol mismatch`);
      }
      this.onInvalidEvent(`${event} (ack)`, parsed.error);
      throw new RealtimeRequestError('INTERNAL', `${event}: unexpected answer`);
    }
    if (!parsed.data.ok) {
      throw new RealtimeRequestError(parsed.data.error.code, parsed.data.error.message);
    }
    return parsed.data.data;
  }

  private wire(socket: BululuClientSocket): BululuClientSocket {
    const store = this.store;
    socket.on('connect', () => {
      store.getState().setStatus('connected');
      for (const listener of [...this.connectListeners]) listener();
    });
    socket.on('disconnect', () => {
      // `active`: Socket.IO reconnects by itself (network drop). Otherwise the client or the
      // server closed the connection on purpose (kick, logout): no reconnection.
      store.getState().setStatus(socket.active ? 'reconnecting' : 'disconnected');
    });
    socket.on('connect_error', (error: Error & { data?: unknown }) => {
      if (socket.active) return; // Temporary failure: Socket.IO keeps retrying.
      // Refused by the handshake middleware (`{ code: UNAUTHORIZED }`): no retries.
      const payload = ErrorPayloadSchema.safeParse(error.data);
      store.getState().setStatus('disconnected', payload.success ? payload.data.code : 'INTERNAL');
    });
    socket.onAny((event: string, ...args: unknown[]) => {
      this.dispatch(event, args[0]);
    });
    return socket;
  }

  private dispatch(event: string, raw: unknown): void {
    if (!isServerEventName(event)) {
      this.onInvalidEvent(event, new Error('unknown event'));
      return;
    }
    const parsed = parseServerEvent(event, raw);
    if (!parsed.ok) {
      this.onInvalidEvent(event, parsed.error);
      return;
    }
    const set = this.listeners.get(event);
    if (set === undefined) return;
    for (const listener of [...set]) (listener as Listener<typeof event>)(parsed.payload);
  }
}

/** The app-wide realtime client (one socket per tab). */
export const realtimeClient = new RealtimeClient();
