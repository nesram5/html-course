import { SESSION_TTL_MS, type TestLoginBody } from '@plaza/shared';
import type { User } from '@prisma/client';

import {
  LOGIN_SCOPES,
  type IdentityProvider,
  type VerifiedIdentity,
} from '../../adapters/identity-provider.js';
import { AppError } from '../../platform/errors.js';
import type { Logger } from '../../platform/logger.js';
import { initialDisplayName } from '../users/me.mapper.js';
import type { AuthRepository } from './auth.repository.js';
import { hashToken, randomToken } from './tokens.js';

/** Sliding expiry is written at most once per this interval to avoid a write per request. */
const SESSION_REFRESH_INTERVAL_MS = 60 * 60 * 1000;

/** The authenticated person behind a request or socket. */
export interface AuthContext {
  userId: string;
  /** Hash of the session token (`Session.id`). */
  sessionId: string;
}

export interface AuthenticatedSession extends AuthContext {
  user: User;
  /** `true` when the expiry was pushed forward: the cookie must be sent again. */
  refreshed: boolean;
}

export interface NewSession {
  /** Raw token for the session cookie. Never stored or logged. */
  token: string;
  user: User;
}

/**
 * Sign-in with Google, test sign-in and sessions (E1-S2). Sessions live in the database under the
 * SHA-256 of their token and expire 30 days after their last use.
 */
export class AuthService {
  constructor(
    private readonly repository: AuthRepository,
    private readonly identity: IdentityProvider,
    private readonly logger: Logger,
    private readonly now: () => Date,
  ) {}

  /** Google consent URL for the sign-in (`openid email profile`). */
  googleAuthorizationUrl(input: {
    state: string;
    codeChallenge: string;
    redirectUri: string;
  }): string {
    return this.identity.createAuthorizationUrl({ ...input, scopes: LOGIN_SCOPES });
  }

  /**
   * Exchanges the code, verifies the `id_token` (in the adapter) and opens a session.
   * Unverified e-mails are refused. The Workspace domain (`hd` claim) is stored on every sign-in:
   * the `allowedDomain` auto-join relies on it, not on the e-mail domain (E2-S4).
   */
  async completeGoogleLogin(input: {
    code: string;
    codeVerifier: string;
    redirectUri: string;
  }): Promise<NewSession> {
    let identity: VerifiedIdentity;
    try {
      identity = await this.identity.exchangeCode(input);
    } catch (error) {
      this.rejectLogin('id_token verification failed', error);
    }
    if (!identity.emailVerified) this.rejectLogin('e-mail not verified by Google');

    const user = await this.repository.upsertUser({
      googleSub: identity.sub,
      email: identity.email.toLowerCase(),
      displayName: initialDisplayName(identity.name, identity.email),
      pictureUrl: identity.pictureUrl,
      hostedDomain: identity.hostedDomain?.toLowerCase() ?? null,
    });
    return this.openSession(user);
  }

  /** Records a rejected sign-in and throws `OAUTH_FAILED` (401). */
  rejectLogin(reason: string, cause?: unknown): never {
    this.logger.warn({ reason }, 'Google sign-in rejected');
    if (cause instanceof AppError && cause.code === 'OAUTH_FAILED') throw cause;
    throw new AppError('OAUTH_FAILED', `Sign-in rejected: ${reason}`, { cause });
  }

  /**
   * `POST /api/auth/test-login` (only with `AUTH_TEST_LOGIN=true`). Without `hostedDomain` the
   * account behaves as a personal Google account (no `hd` claim).
   */
  async testLogin(body: TestLoginBody): Promise<NewSession> {
    const email = body.email.toLowerCase();
    const user = await this.repository.upsertUser({
      googleSub: body.googleSub ?? email,
      email,
      displayName: initialDisplayName(body.displayName ?? '', email),
      pictureUrl: null,
      hostedDomain: body.hostedDomain?.toLowerCase() ?? null,
    });
    return this.openSession(user);
  }

  async openSession(user: User): Promise<NewSession> {
    const token = randomToken();
    await this.repository.createSession({
      id: hashToken(token),
      userId: user.id,
      expiresAt: new Date(this.now().getTime() + SESSION_TTL_MS),
    });
    return { token, user };
  }

  /** Resolves a session token; `null` when unknown or expired (expired sessions are deleted). */
  async authenticate(token: string): Promise<AuthenticatedSession | null> {
    const id = hashToken(token);
    const session = await this.repository.findSession(id);
    if (session === null) return null;
    const now = this.now().getTime();
    if (session.expiresAt.getTime() <= now) {
      await this.repository.deleteSession(id);
      return null;
    }
    const refreshed =
      session.expiresAt.getTime() - now < SESSION_TTL_MS - SESSION_REFRESH_INTERVAL_MS;
    if (refreshed) await this.repository.extendSession(id, new Date(now + SESSION_TTL_MS));
    return { userId: session.userId, sessionId: id, user: session.user, refreshed };
  }

  /** Deletes the session: reusing its cookie afterwards gets 401 (E1-S2). Returns its id. */
  async logout(token: string): Promise<string> {
    const id = hashToken(token);
    await this.repository.deleteSession(id);
    return id;
  }
}
