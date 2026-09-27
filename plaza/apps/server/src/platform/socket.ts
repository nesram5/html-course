import {
  CLIENT_EVENT_SCHEMAS,
  PROTOCOL_VERSION,
  REALTIME_PATH,
  type Ack,
  type ClientEventName,
  type ClientEventPayload,
  type ClientToServerEvents,
  type ErrorPayload,
  type ServerToClientEvents,
} from '@plaza/shared';
import type { FastifyInstance } from 'fastify';
import { Server, type Socket } from 'socket.io';

import type { ErrorReporter } from './error-reporter.js';
import { AppError, normalizeError } from './errors.js';
import type { Logger } from './logger.js';

/** Per-connection data, filled by the auth middleware (E1/E4) and `space:join` (E4-S1). */
export interface SocketData {
  userId?: string;
  sessionId?: string;
  spaceId?: string;
}

// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- single server process (no adapter) in the MVP
export interface InterServerEvents {}

export type PlazaIo = Server<
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData
>;
export type PlazaSocket = Socket<
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData
>;

declare module 'fastify' {
  interface FastifyInstance {
    /** Typed Socket.IO server mounted at `/realtime`. */
    io: PlazaIo;
  }
}

/**
 * Mounts Socket.IO on Fastify's HTTP server at `/realtime` (WebSocket transport only).
 * CORS does not apply to WebSocket upgrades, so the handshake itself checks `Origin`: a browser
 * on another origin is refused even if it carries the session cookie (cross-site WebSocket
 * hijacking). Requests without `Origin` come from non-browser clients, which cannot ride on
 * someone else's cookie.
 */
export function attachSocketServer(app: FastifyInstance, options: { corsOrigin: string }): PlazaIo {
  const allowedOrigin = new URL(options.corsOrigin).origin;
  const io: PlazaIo = new Server(app.server, {
    path: REALTIME_PATH,
    transports: ['websocket'],
    serveClient: false,
    cors: { origin: options.corsOrigin, credentials: true },
    allowRequest: (request, callback) => {
      const { origin } = request.headers;
      callback(null, origin === undefined || origin === allowedOrigin);
    },
  });
  app.decorate('io', io);
  app.addHook('preClose', (done) => {
    io.local.disconnectSockets(true);
    done();
  });
  app.addHook('onClose', async () => {
    await new Promise<void>((resolve) => {
      void io.close(() => {
        resolve();
      });
    });
  });
  return io;
}

/** Value a handler returns for events with an ack (e.g. `SpaceSnapshot` for `space:join`). */
export type AckDataOf<E extends ClientEventName> =
  Parameters<ClientToServerEvents[E]> extends [unknown, (res: Ack<infer T>) => void]
    ? T
    : undefined;

export interface SafeHandlerDeps {
  logger: Logger;
  reporter: ErrorReporter;
}

function isAckCallback(value: unknown): value is (res: Ack<unknown>) => void {
  return typeof value === 'function';
}

function protocolVersionOf(raw: unknown): unknown {
  return typeof raw === 'object' && raw !== null && 'v' in raw ? raw.v : undefined;
}

/**
 * Wraps a socket event handler (standards §4):
 * - rejects payloads whose `v` differs from `PROTOCOL_VERSION` with `PROTOCOL_MISMATCH`;
 * - validates the payload with its zod schema from `@plaza/shared` (`VALIDATION_ERROR`);
 * - catches every error: `AppError` keeps its code, anything else is logged, reported and
 *   answered as `INTERNAL`. An error never crashes the process;
 * - answers through the ack when the client sent one, otherwise emits `error`.
 *
 * Usage: `socket.on('chat:send', safeHandler(deps, socket, 'chat:send', async (p) => ...))`.
 */
export function safeHandler<E extends ClientEventName>(
  deps: SafeHandlerDeps,
  socket: PlazaSocket,
  event: E,
  handler: (payload: ClientEventPayload<E>) => AckDataOf<E> | Promise<AckDataOf<E>>,
): (raw: unknown, ack?: unknown) => void {
  const schema = CLIENT_EVENT_SCHEMAS[event];

  const fail = (error: ErrorPayload, ack: unknown): void => {
    if (isAckCallback(ack)) ack({ ok: false, error });
    else socket.emit('error', error);
  };

  return (raw, ack) => {
    void (async () => {
      try {
        if (protocolVersionOf(raw) !== PROTOCOL_VERSION) {
          throw new AppError(
            'PROTOCOL_MISMATCH',
            `Expected protocol version ${String(PROTOCOL_VERSION)}`,
          );
        }
        // The schema map is keyed by event, so the parsed payload is the event payload.
        const payload = schema.parse(raw) as ClientEventPayload<E>;
        const result = await handler(payload);
        if (isAckCallback(ack)) ack({ ok: true, data: result ?? null });
      } catch (error) {
        const { payload, unexpected } = normalizeError(error);
        const context = {
          event,
          ...(socket.data.userId !== undefined && { userId: socket.data.userId }),
          ...(socket.data.spaceId !== undefined && { spaceId: socket.data.spaceId }),
        };
        if (unexpected) {
          deps.logger.error({ err: error, ...context }, 'Socket handler failed');
          deps.reporter.captureException(error, context);
        } else {
          deps.logger.debug({ code: payload.code, ...context }, 'Socket event rejected');
        }
        fail(payload, ack);
      }
    })();
  };
}
