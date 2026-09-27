import { SESSION_COOKIE_NAME, SESSION_TTL_MS } from '@plaza/shared';
import type { FastifyReply, FastifyRequest, preHandlerAsyncHookHandler } from 'fastify';

import { AppError } from '../../platform/errors.js';
import type { AuthContext, AuthService } from './auth.service.js';
import { hashToken } from './tokens.js';

declare module 'fastify' {
  interface FastifyRequest {
    /** Set by `requireUser`; `null` on public routes. */
    auth: AuthContext | null;
  }
}

/** `plaza_sid`: `HttpOnly`, `Secure`, `SameSite=Lax`, 30 days sliding (architecture §11.1). */
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
 * Key of per-person route rate limits (`config.rateLimit.keyGenerator`): the session, hashed, so
 * people behind one office NAT do not share a budget; the IP without a session.
 */
export function sessionRateLimitKey(request: FastifyRequest): string {
  const token = sessionTokenOf(request);
  return token === undefined ? `ip:${request.ip}` : `sid:${hashToken(token)}`;
}
