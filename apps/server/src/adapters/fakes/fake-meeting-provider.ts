import { AppError } from '../../platform/errors.js';
import type { AuthorizationRequest, CodeExchange } from '../identity-provider.js';
import type { MeetingProvider, MeetingSpace } from '../meeting-provider.js';

export const FAKE_MEET_AUTHORIZE_URL = 'https://accounts.fake.test/o/oauth2/auth?meet=1';

/** In-memory Google Meet: returns deterministic `https://meet.google.com/fak-xxxx-nnn` links. */
export class FakeMeetingProvider implements MeetingProvider {
  #created = 0;
  #failure: AppError | null = null;
  readonly calls: { authorization: CodeExchange; count: number }[] = [];

  /** Makes the next calls fail (e.g. the owner denied consent or Google is down). */
  failWith(error: AppError | null = new AppError('MEETING_PROVIDER_ERROR')): void {
    this.#failure = error;
  }

  createAuthorizationUrl(request: Omit<AuthorizationRequest, 'scopes'>): string {
    const url = new URL(FAKE_MEET_AUTHORIZE_URL);
    url.searchParams.set('state', request.state);
    url.searchParams.set('redirect_uri', request.redirectUri);
    return url.toString();
  }

  createMeetingSpaces(input: {
    authorization: CodeExchange;
    count: number;
  }): Promise<MeetingSpace[]> {
    this.calls.push(input);
    if (this.#failure !== null) return Promise.reject(this.#failure);
    const spaces = Array.from({ length: input.count }, () => {
      this.#created += 1;
      const suffix = String(this.#created).padStart(3, '0');
      return { meetingUri: `https://meet.google.com/fak-meet-${suffix}` };
    });
    return Promise.resolve(spaces);
  }
}
