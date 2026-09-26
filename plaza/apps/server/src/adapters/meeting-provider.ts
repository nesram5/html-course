import type { AuthorizationRequest, CodeExchange } from './identity-provider.js';

/**
 * Meeting provider port (ADR-010, E2-S7). The real implementation is the Google Meet REST API
 * (`google-meet.ts`, `POST https://meet.googleapis.com/v2/spaces`, TODO E2-S7) with incremental
 * authorization of the `meetings.space.created` scope.
 *
 * The access token is obtained and discarded INSIDE `createMeetingSpaces`: Plaza never stores
 * Google credentials.
 */
export interface MeetingSpace {
  /** e.g. https://meet.google.com/abc-defg-hij */
  meetingUri: string;
}

export interface MeetingProvider {
  /** Consent URL asking for the `meetings.space.created` scope. */
  createAuthorizationUrl(request: Omit<AuthorizationRequest, 'scopes'>): string;
  /**
   * Exchanges the code and creates `count` permanent Meet spaces with `accessType: TRUSTED`.
   * Throws `AppError('MEETING_PROVIDER_ERROR')` on failure (the owner can paste links by hand).
   */
  createMeetingSpaces(input: {
    authorization: CodeExchange;
    count: number;
  }): Promise<MeetingSpace[]>;
}

export const MEET_SCOPES = ['https://www.googleapis.com/auth/meetings.space.created'] as const;
