import { fastifyOauth2 } from '@fastify/oauth2';
import { CodeChallengeMethod, OAuth2Client } from 'google-auth-library';

import type { AuthorizationRequest } from './identity-provider.js';

/** Credentials of the Google OAuth client (`GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`). */
export interface GoogleOAuthOptions {
  clientId: string;
  clientSecret: string;
  /** HTTP transport; tests pass a mocked `fetch`. Defaults to the global one. */
  fetch?: typeof fetch;
}

const google = fastifyOauth2.GOOGLE_CONFIGURATION;

/** Google's authorization endpoint, as published by `@fastify/oauth2`. */
export const GOOGLE_AUTHORIZE_URL = `${google.authorizeHost ?? 'https://accounts.google.com'}${
  google.authorizePath ?? '/o/oauth2/v2/auth'
}`;

/** Creates the `google-auth-library` client shared by the sign-in and Meet adapters. */
export function createGoogleOAuthClient(options: GoogleOAuthOptions): OAuth2Client {
  return new OAuth2Client({
    clientId: options.clientId,
    clientSecret: options.clientSecret,
    endpoints: { oauth2AuthBaseUrl: GOOGLE_AUTHORIZE_URL },
    ...(options.fetch !== undefined && {
      transporterOptions: { fetchImplementation: options.fetch },
    }),
  });
}

/**
 * Consent URL for the authorization code flow with PKCE (S256) and `state`. The auth module owns
 * `state` and the code verifier; `include_granted_scopes` enables incremental authorization.
 */
export function googleAuthorizationUrl(
  client: OAuth2Client,
  request: AuthorizationRequest,
  extra: { prompt?: string } = {},
): string {
  return client.generateAuthUrl({
    response_type: 'code',
    access_type: 'online',
    include_granted_scopes: true,
    scope: [...request.scopes],
    state: request.state,
    redirect_uri: request.redirectUri,
    code_challenge: request.codeChallenge,
    code_challenge_method: CodeChallengeMethod.S256,
    ...(request.loginHint !== undefined && { login_hint: request.loginHint }),
    ...(extra.prompt !== undefined && { prompt: extra.prompt }),
  });
}
