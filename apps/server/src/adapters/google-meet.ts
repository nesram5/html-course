import { MEET_URI_PREFIX } from '@bululu/shared';
import type { OAuth2Client } from 'google-auth-library';
import { z } from 'zod';

import { AppError } from '../platform/errors.js';
import {
  createGoogleOAuthClient,
  googleAuthorizationUrl,
  type GoogleOAuthOptions,
} from './google-oauth-client.js';
import type { AuthorizationRequest, CodeExchange } from './identity-provider.js';
import { MEET_SCOPES, type MeetingProvider, type MeetingSpace } from './meeting-provider.js';

/** Google Meet REST API: `spaces.create`. */
export const MEET_SPACES_URL = 'https://meet.googleapis.com/v2/spaces';

const MeetSpaceResponseSchema = z.object({
  meetingUri: z.string().refine((uri) => uri.startsWith(MEET_URI_PREFIX)),
});

/**
 * Google Meet adapter (ADR-010, E2-S7). The owner grants `meetings.space.created` through an
 * incremental authorization; the code is exchanged here, the access token is used to create one
 * permanent Meet space per room with `accessType: TRUSTED` and then goes out of scope: it is never
 * returned, stored or logged.
 */
export class GoogleMeetProvider implements MeetingProvider {
  readonly #client: OAuth2Client;
  readonly #fetch: typeof fetch;

  constructor(options: GoogleOAuthOptions) {
    this.#client = createGoogleOAuthClient(options);
    this.#fetch = options.fetch ?? fetch;
  }

  createAuthorizationUrl(request: Omit<AuthorizationRequest, 'scopes'>): string {
    return googleAuthorizationUrl(this.#client, { ...request, scopes: MEET_SCOPES });
  }

  async createMeetingSpaces(input: {
    authorization: CodeExchange;
    count: number;
  }): Promise<MeetingSpace[]> {
    const accessToken = await this.#exchange(input.authorization);
    const spaces: MeetingSpace[] = [];
    for (let i = 0; i < input.count; i++) {
      spaces.push(await this.#createSpace(accessToken));
    }
    return spaces;
  }

  async #exchange(authorization: CodeExchange): Promise<string> {
    try {
      const { tokens } = await this.#client.getToken({
        code: authorization.code,
        codeVerifier: authorization.codeVerifier,
        redirect_uri: authorization.redirectUri,
      });
      if (typeof tokens.access_token !== 'string' || tokens.access_token === '') {
        throw new Error('Google did not return an access token');
      }
      return tokens.access_token;
    } catch (error) {
      throw new AppError('MEETING_PROVIDER_ERROR', 'Google authorization failed', {
        cause: error,
      });
    }
  }

  async #createSpace(accessToken: string): Promise<MeetingSpace> {
    let response: Response;
    try {
      response = await this.#fetch(MEET_SPACES_URL, {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ config: { accessType: 'TRUSTED' } }),
      });
    } catch (error) {
      throw new AppError('MEETING_PROVIDER_ERROR', 'Google Meet is unreachable', { cause: error });
    }
    if (!response.ok) {
      throw new AppError(
        'MEETING_PROVIDER_ERROR',
        `Google Meet answered ${String(response.status)}`,
      );
    }
    const parsed = MeetSpaceResponseSchema.safeParse(await response.json().catch(() => null));
    if (!parsed.success) {
      throw new AppError('MEETING_PROVIDER_ERROR', 'Unexpected Google Meet response');
    }
    return { meetingUri: parsed.data.meetingUri };
  }
}
