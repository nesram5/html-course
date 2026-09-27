import type { OAuth2Client } from 'google-auth-library';

import { AppError } from '../platform/errors.js';
import {
  createGoogleOAuthClient,
  googleAuthorizationUrl,
  type GoogleOAuthOptions,
} from './google-oauth-client.js';
import type {
  AuthorizationRequest,
  CodeExchange,
  IdentityProvider,
  VerifiedIdentity,
} from './identity-provider.js';

/**
 * Google OpenID Connect sign-in (ADR-007, E1-S2): authorization code + PKCE, then the `id_token`
 * is verified with `google-auth-library` (signature against Google's certificates, audience =
 * our client id, issuer `accounts.google.com`, expiry). Google tokens never leave this method:
 * only `sub`, e-mail, name and picture are returned.
 */
export class GoogleIdentityProvider implements IdentityProvider {
  readonly #client: OAuth2Client;
  readonly #clientId: string;

  constructor(options: GoogleOAuthOptions) {
    this.#client = createGoogleOAuthClient(options);
    this.#clientId = options.clientId;
  }

  createAuthorizationUrl(request: AuthorizationRequest): string {
    return googleAuthorizationUrl(this.#client, request, { prompt: 'select_account' });
  }

  async exchangeCode(exchange: CodeExchange): Promise<VerifiedIdentity> {
    let idToken: string | null | undefined;
    try {
      const { tokens } = await this.#client.getToken({
        code: exchange.code,
        codeVerifier: exchange.codeVerifier,
        redirect_uri: exchange.redirectUri,
      });
      idToken = tokens.id_token;
    } catch (error) {
      throw new AppError('OAUTH_FAILED', 'Authorization code exchange failed', { cause: error });
    }
    if (idToken === null || idToken === undefined) {
      throw new AppError('OAUTH_FAILED', 'Google did not return an id_token');
    }

    let payload;
    try {
      const ticket = await this.#client.verifyIdToken({ idToken, audience: this.#clientId });
      payload = ticket.getPayload();
    } catch (error) {
      throw new AppError('OAUTH_FAILED', 'Invalid id_token', { cause: error });
    }
    if (payload?.email === undefined || payload.sub === '') {
      throw new AppError('OAUTH_FAILED', 'The id_token has no subject or e-mail');
    }

    return {
      sub: payload.sub,
      email: payload.email.toLowerCase(),
      emailVerified: payload.email_verified === true,
      name: payload.name ?? payload.email.split('@')[0] ?? payload.email,
      pictureUrl: payload.picture ?? null,
      hostedDomain: payload.hd ?? null,
    };
  }
}
