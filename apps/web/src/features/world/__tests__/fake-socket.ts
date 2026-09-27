import type { BululuClientSocket } from '../realtime/realtime-client';

type Handler = (...args: unknown[]) => void;

export interface SentAck {
  readonly event: string;
  readonly payload: unknown;
  readonly timeoutMs: number;
  resolve(value: unknown): void;
  reject(error: Error): void;
}

/**
 * In-memory stand-in for a socket.io-client `Socket`, with the same connection semantics
 * (`connected`, `active`, reserved events) and helpers to play the server side.
 */
export class FakeSocket {
  connected = false;
  active = false;
  connectCalls = 0;
  readonly sent: { event: string; payload: unknown }[] = [];
  readonly acks: SentAck[] = [];
  private readonly handlers = new Map<string, Set<Handler>>();
  private readonly anyHandlers = new Set<Handler>();

  asSocket(): BululuClientSocket {
    return this as unknown as BululuClientSocket;
  }

  on(event: string, handler: Handler): this {
    let set = this.handlers.get(event);
    if (set === undefined) {
      set = new Set();
      this.handlers.set(event, set);
    }
    set.add(handler);
    return this;
  }

  onAny(handler: Handler): this {
    this.anyHandlers.add(handler);
    return this;
  }

  connect(): this {
    this.connectCalls++;
    this.active = true;
    return this;
  }

  disconnect(): this {
    const wasConnected = this.connected;
    this.connected = false;
    this.active = false;
    if (wasConnected) this.fire('disconnect', 'io client disconnect');
    return this;
  }

  emit(event: string, payload: unknown): this {
    this.sent.push({ event, payload });
    return this;
  }

  timeout(timeoutMs: number) {
    return {
      emitWithAck: (event: string, payload: unknown) =>
        new Promise<unknown>((resolve, reject) => {
          this.acks.push({ event, payload, timeoutMs, resolve, reject });
        }),
    };
  }

  // ---- Server side ------------------------------------------------------------------------

  /** The handshake succeeded. */
  accept(): void {
    this.connected = true;
    this.active = true;
    this.fire('connect');
  }

  /** The network dropped: Socket.IO will reconnect by itself. */
  drop(): void {
    this.connected = false;
    this.active = true;
    this.fire('disconnect', 'transport close');
  }

  /** The server closed the connection (`socket.disconnect(true)`): no reconnection. */
  closeFromServer(): void {
    this.connected = false;
    this.active = false;
    this.fire('disconnect', 'io server disconnect');
  }

  /** The handshake middleware refused the connection with `err.data`. */
  refuse(data: unknown): void {
    this.active = false;
    const error = Object.assign(new Error('refused'), { data });
    this.fire('connect_error', error);
  }

  /** A temporary connection failure (server down): Socket.IO keeps retrying. */
  failTemporarily(): void {
    this.fire('connect_error', new Error('xhr poll error'));
  }

  /** Sends an event to the client (any payload, valid or not). */
  serverEmit(event: string, payload: unknown): void {
    for (const handler of [...this.anyHandlers]) handler(event, payload);
  }

  /** The last ack request of an event. */
  lastAck(event: string): SentAck {
    const ack = this.acks.filter((candidate) => candidate.event === event).at(-1);
    if (ack === undefined) throw new Error(`no ${event} was sent`);
    return ack;
  }

  private fire(event: string, ...args: unknown[]): void {
    for (const handler of [...(this.handlers.get(event) ?? [])]) handler(...args);
  }
}
