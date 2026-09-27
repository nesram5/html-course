import type { MediaProvider, MediaTokenRequest } from '../media-provider.js';

/**
 * In-memory media server. Tokens are readable strings; mutes and removals are recorded for
 * assertions.
 */
export class FakeMediaProvider implements MediaProvider {
  readonly tokens: MediaTokenRequest[] = [];
  readonly mutes: { roomName: string; identity: string }[] = [];
  readonly removals: { roomName: string; identity: string }[] = [];

  constructor(readonly url: string = 'ws://localhost:7880') {}

  createToken(request: MediaTokenRequest): Promise<string> {
    this.tokens.push(request);
    return Promise.resolve(`fake-token:${request.roomName}:${request.identity}`);
  }

  mutePublishedTracks(input: { roomName: string; identity: string }): Promise<void> {
    this.mutes.push(input);
    return Promise.resolve();
  }

  removeParticipant(input: { roomName: string; identity: string }): Promise<void> {
    this.removals.push(input);
    return Promise.resolve();
  }
}
