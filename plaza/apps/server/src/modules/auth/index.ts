import type { preHandlerAsyncHookHandler } from 'fastify';

import type { PlazaModule } from '../types.js';
import { AuthRepository } from './auth.repository.js';
import { registerAuthRoutes } from './auth.routes.js';
import { AuthService } from './auth.service.js';
import { createSocketAuthMiddleware } from './auth.socket.js';
import { createRequireUser } from './session-http.js';

export type { AuthContext } from './auth.service.js';
export { clearSessionCookie, currentUser, sessionRateLimitKey } from './session-http.js';
export { socketUserId } from './auth.socket.js';
export { OAuthFlowCookie, type FlowSecrets } from './oauth-flow.js';

/** What the auth module offers to the modules registered after it. */
export interface AuthApi {
  service: AuthService;
  /** Fastify `preHandler`: 401 `UNAUTHORIZED` without a valid session; sets `request.auth`. */
  requireUser: preHandlerAsyncHookHandler;
}

declare module '../types.js' {
  interface ModuleServices {
    auth: AuthApi;
  }
}

/**
 * Auth module (E1-S2): Google sign-in (PKCE + state), `plaza_sid` sessions with sliding expiry,
 * logout, test sign-in and the Socket.IO handshake authentication. Must be registered before any
 * module with protected routes or socket handlers.
 */
export const authModule: PlazaModule = {
  name: 'auth',
  register({ app, io, container, services }) {
    const service = new AuthService(
      new AuthRepository(container.db),
      container.identity,
      container.logger,
      container.now,
    );
    app.decorateRequest('auth', null);
    registerAuthRoutes(app, { auth: service, config: container.config, logger: container.logger });
    io.use(
      createSocketAuthMiddleware({
        auth: service,
        parseCookie: (header) => app.parseCookie(header),
        logger: container.logger,
      }),
    );
    services.provide('auth', { service, requireUser: createRequireUser(service) });
  },
};
