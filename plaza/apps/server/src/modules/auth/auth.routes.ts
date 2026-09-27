import {
  API_PATHS,
  AuthStartQuerySchema,
  OAuthCallbackQuerySchema,
  SafeNextPathSchema,
  TestLoginBodySchema,
  TestLoginResponseSchema,
  WEB_PATHS,
  type LoginErrorReason,
  type TestLoginResponse,
} from '@plaza/shared';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import type { AppConfig } from '../../platform/config.js';
import type { Logger } from '../../platform/logger.js';
import { toMeDto } from '../users/me.mapper.js';
import type { AuthService } from './auth.service.js';
import { OAuthFlowCookie, type FlowSecrets } from './oauth-flow.js';
import { clearSessionCookie, sessionTokenOf, setSessionCookie } from './session-http.js';

export const LOGIN_FLOW_COOKIE = 'plaza_oauth_login';

const loginFlow = new OAuthFlowCookie(LOGIN_FLOW_COOKIE, z.object({ next: SafeNextPathSchema }));

interface AuthRoutesDeps {
  auth: AuthService;
  config: AppConfig;
  logger: Logger;
}

export function registerAuthRoutes(app: FastifyInstance, deps: AuthRoutesDeps): void {
  const { auth, config, logger } = deps;
  const redirectUri = `${config.publicUrl}${API_PATHS.authGoogleCallback}`;

  const loginPageUrl = (reason: LoginErrorReason, next: string): string => {
    const params = new URLSearchParams({ error: reason, next });
    return `${config.publicUrl}${WEB_PATHS.login}?${params.toString()}`;
  };

  // Starts the sign-in: PKCE + state in a signed cookie, then Google's consent screen.
  app.get(API_PATHS.authGoogle, (request, reply) => {
    const query = AuthStartQuerySchema.safeParse(request.query);
    const next = (query.success ? query.data.next : undefined) ?? WEB_PATHS.spaces;
    const { state, codeChallenge } = loginFlow.begin(reply, { next });
    return reply.redirect(auth.googleAuthorizationUrl({ state, codeChallenge, redirectUri }));
  });

  app.get(API_PATHS.authGoogleCallback, async (request, reply) => {
    const query = OAuthCallbackQuerySchema.parse(request.query);
    const flow = loginFlow.take(request, reply);
    const next = flow?.next ?? WEB_PATHS.spaces;

    if (query.error !== undefined) {
      // The person cancelled on Google (access_denied) or Google refused: back to the login page.
      logger.info({ oauthError: query.error }, 'Google sign-in not completed');
      return reply.redirect(
        loginPageUrl(query.error === 'access_denied' ? 'cancelled' : 'failed', next),
      );
    }

    let verified: { next: string } & FlowSecrets;
    try {
      verified = OAuthFlowCookie.verify(flow, query.state);
    } catch (error) {
      return auth.rejectLogin('invalid or missing state', error);
    }
    const { code } = query;
    if (code === undefined) return auth.rejectLogin('missing authorization code');

    const session = await auth.completeGoogleLogin({
      code,
      codeVerifier: verified.verifier,
      redirectUri,
    });
    setSessionCookie(reply, session.token);
    return reply.redirect(`${config.publicUrl}${verified.next}`);
  });

  app.post(API_PATHS.authLogout, async (request, reply) => {
    const token = sessionTokenOf(request);
    if (token !== undefined) {
      const sessionId = await auth.logout(token);
      // Realtime connections opened with this session end too (other tabs of this browser):
      // the handshake is the only moment a socket shows its cookie.
      for (const socket of app.io.sockets.sockets.values()) {
        if (socket.data.sessionId === sessionId) socket.disconnect(true);
      }
    }
    clearSessionCookie(reply);
    return reply.code(204).send();
  });

  // Test-only sign-in (CI and local). Config validation forbids it in production.
  if (config.authTestLogin) {
    app.post(API_PATHS.authTestLogin, async (request, reply): Promise<TestLoginResponse> => {
      const body = TestLoginBodySchema.parse(request.body);
      const session = await auth.testLogin(body);
      setSessionCookie(reply, session.token);
      return TestLoginResponseSchema.parse({ user: toMeDto(session.user) });
    });
  }
}
