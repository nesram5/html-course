import { AppError } from '../../platform/errors.js';
import type {
  AuthorizationRequest,
  CodeExchange,
  IdentityProvider,
  VerifiedIdentity,
} from '../identity-provider.js';

export const FAKE_AUTHORIZE_URL = 'https://accounts.fake.test/o/oauth2/auth';

/**
 * In-memory identity provider for tests and local development without Google credentials.
 * Register an identity for a code with `willAuthenticate(code, identity)`; unknown codes fail
 * like an invalid `id_token` would.
 */
export class FakeIdentityProvider implements IdentityProvider {
  readonly #identities = new Map<string, VerifiedIdentity>();
  readonly requests: AuthorizationRequest[] = [];
  readonly exchanges: CodeExchange[] = [];

  willAuthenticate(code: string, identity: Partial<VerifiedIdentity> & { email: string }): void {
    this.#identities.set(code, {
      sub: identity.sub ?? `fake-${identity.email}`,
      email: identity.email,
      emailVerified: identity.emailVerified ?? true,
      name: identity.name ?? identity.email.split('@')[0] ?? identity.email,
      pictureUrl: identity.pictureUrl ?? null,
      hostedDomain: identity.hostedDomain ?? null,
    });
  }

  createAuthorizationUrl(request: AuthorizationRequest): string {
    this.requests.push(request);
    const url = new URL(FAKE_AUTHORIZE_URL);
    url.searchParams.set('state', request.state);
    url.searchParams.set('code_challenge', request.codeChallenge);
    url.searchParams.set('code_challenge_method', 'S256');
    url.searchParams.set('redirect_uri', request.redirectUri);
    url.searchParams.set('scope', request.scopes.join(' '));
    return url.toString();
  }

  exchangeCode(exchange: CodeExchange): Promise<VerifiedIdentity> {
    this.exchanges.push(exchange);
    const identity = this.#identities.get(exchange.code);
    if (identity === undefined) {
      return Promise.reject(new AppError('OAUTH_FAILED', 'Unknown authorization code'));
    }
    return Promise.resolve(identity);
  }
}
