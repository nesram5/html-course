import { SESSION_COOKIE_NAME, type ErrorPayload } from '@plaza/shared';
import type { ExtendedError } from 'socket.io';

import { AppError } from '../../platform/errors.js';
import type { Logger } from '../../platform/logger.js';
import type { PlazaIo, PlazaSocket } from '../../platform/socket.js';
import type { AuthService } from './auth.service.js';

type SocketMiddleware = Parameters<PlazaIo['use']>[0];

function handshakeError(payload: ErrorPayload): ExtendedError {
  const error: ExtendedError = new Error(payload.message);
  // Sent to the client as `connect_error` → `err.data` (Socket.IO middleware errors).
  error.data = payload;
  return error;
}

/**
 * Socket.IO handshake authentication (`requireUser` for sockets, E1-S2 / E4-S1): reads the
 * `plaza_sid` cookie of the upgrade request and fills `socket.data.userId` / `sessionId`.
 * Connections without a valid session are refused with `connect_error` `{ code: UNAUTHORIZED }`.
 */
export function createSocketAuthMiddleware(deps: {
  auth: AuthService;
  parseCookie: (header: string) => Record<string, string | undefined>;
  logger: Logger;
}): SocketMiddleware {
  return (socket, next) => {
    const token = deps.parseCookie(socket.request.headers.cookie ?? '')[SESSION_COOKIE_NAME];
    if (token === undefined || token === '') {
      next(handshakeError({ code: 'UNAUTHORIZED', message: 'Authentication required' }));
      return;
    }
    deps.auth
      .authenticate(token)
      .then((session) => {
        if (session === null) {
          next(handshakeError({ code: 'UNAUTHORIZED', message: 'Authentication required' }));
          return;
        }
        socket.data.userId = session.userId;
        socket.data.sessionId = session.sessionId;
        next();
      })
      .catch((error: unknown) => {
        deps.logger.error({ err: error }, 'Socket authentication failed');
        next(handshakeError({ code: 'INTERNAL', message: 'Internal server error' }));
      });
  };
}

/** userId of an authenticated socket (always set after the handshake middleware). */
export function socketUserId(socket: PlazaSocket): string {
  if (socket.data.userId === undefined) throw new AppError('UNAUTHORIZED');
  return socket.data.userId;
}
