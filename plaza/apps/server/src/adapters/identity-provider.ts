/**
 * Identity provider port (ADR-007, E1-S2). The real implementation is Google OpenID Connect
 * (`google-oidc.ts`, TODO E1-S2); tests and local development use `FakeIdentityProvider`.
 *
 * The auth module owns `state` and the PKCE verifier (signed cookie) and calls this port only
 * to build the redirect URL and to exchange the code. Tokens never leave the adapter.
 */
export interface VerifiedIdentity {
  /** Stable subject (`sub` claim). */
  sub: string;
  email: string;
  emailVerified: boolean;
  name: string;
  pictureUrl: string | null;
  /** Google Workspace domain (`hd` claim), if any. */
  hostedDomain: string | null;
}

export interface AuthorizationRequest {
  state: string;
  /** PKCE S256 code challenge. */
  codeChallenge: string;
  redirectUri: string;
  scopes: readonly string[];
  loginHint?: string;
}

export interface CodeExchange {
  code: string;
  codeVerifier: string;
  redirectUri: string;
}

export interface IdentityProvider {
  /** URL of the provider consent screen. */
  createAuthorizationUrl(request: AuthorizationRequest): string;
  /**
   * Exchanges the one-time code and verifies the `id_token` (audience, issuer, expiry).
   * Throws `AppError('OAUTH_FAILED')` when anything is wrong.
   */
  exchangeCode(exchange: CodeExchange): Promise<VerifiedIdentity>;
}

/** OpenID scopes of the sign-in (architecture §11.1). */
export const LOGIN_SCOPES = ['openid', 'email', 'profile'] as const;
