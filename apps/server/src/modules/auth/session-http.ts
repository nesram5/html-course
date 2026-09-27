import { SESSION_COOKIE_NAME, SESSION_TTL_MS } from '@bululu/shared';
import type {
  FastifyInstance,
  FastifyReply,
  FastifyRequest,
  preHandlerAsyncHookHandler,
} from 'fastify';

import { AppError } from '../../platform/errors.js';
import type { AuthContext, AuthService } from './auth.service.js';

declare module 'fastify' {
  interface FastifyRequest {
    /** Set by `requireUser`; `null` on public routes. */
    auth: AuthContext | null;
  }
}

/** `__Host-bululu_sid`: `HttpOnly`, `Secure`, `SameSite=Lax`, 30 days sliding (architecture §11.1). */
export function setSessionCookie(reply: FastifyReply, token: string): void {
  reply.setCookie(SESSION_COOKIE_NAME, token, {
    path: '/',
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    maxAge: Math.floor(SESSION_TTL_MS / 1000),
  });
}

export function clearSessionCookie(reply: FastifyReply): void {
  reply.clearCookie(SESSION_COOKIE_NAME, { path: '/' });
}

export function sessionTokenOf(request: FastifyRequest): string | undefined {
  const token = request.cookies[SESSION_COOKIE_NAME];
  return token === '' ? undefined : token;
}

/** Fastify `preHandler` that rejects requests without a valid session with 401 `UNAUTHORIZED`. */
export function createRequireUser(auth: AuthService): preHandlerAsyncHookHandler {
  return async (request, reply) => {
    const token = sessionTokenOf(request);
    if (token === undefined) throw new AppError('UNAUTHORIZED');
    const session = await auth.authenticate(token);
    if (session === null) {
      clearSessionCookie(reply);
      throw new AppError('UNAUTHORIZED');
    }
    request.auth = { userId: session.userId, sessionId: session.sessionId };
    if (session.refreshed) setSessionCookie(reply, token);
  };
}

/** The authenticated person of a route protected by `requireUser`. */
export function currentUser(request: FastifyRequest): AuthContext {
  if (request.auth === null) throw new AppError('UNAUTHORIZED');
  return request.auth;
}

/**
 * Per-session limit of a route (`max` requests per `timeWindow`), as a `preHandler` placed AFTER
 * `requireUser`: the key is the id of the session that was just verified, so people behind one
 * office NAT do not share a budget. Being a separate check, the route keeps the global per-IP
 * limit too (a route-level `config.rateLimit` would replace it). A key taken from the raw cookie
 * would let anyone skip every limit by sending a different made-up cookie with each request, each
 * one costing a session lookup (E8-S2). Over the limit: 429 `RATE_LIMITED`.
 */
export function sessionRateLimit(
  app: FastifyInstance,
  options: { max: number; timeWindow: string },
): preHandlerAsyncHookHandler {
  const check = app.createRateLimit({
    max: options.max,
    timeWindow: options.timeWindow,
    keyGenerator: (request) => `sid:${currentUser(request).sessionId}`,
  });
  return async (request, reply) => {
    const result = await check(request);
    if (result.isAllowed || !result.isExceeded) return;
    void reply.header('retry-after', String(result.ttlInSeconds));
    throw new AppError(
      'RATE_LIMITED',
      `Rate limit exceeded, retry in ${String(result.ttlInSeconds)} s`,
    );
  };
}
