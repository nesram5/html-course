import type { MediaProvider, MediaTokenRequest } from '../media-provider.js';

/**
 * In-memory media server. Tokens are readable strings; mutes, publish permissions and removals
 * are recorded for assertions.
 */
export class FakeMediaProvider implements MediaProvider {
  readonly tokens: MediaTokenRequest[] = [];
  readonly mutes: { roomName: string; identity: string }[] = [];
  readonly removals: { roomName: string; identity: string }[] = [];
  readonly permissions: { roomName: string; identity: string; canPublish: boolean }[] = [];
  /**
   * Participants connected to the fake media server, by `roomName:identity`, with their current
   * `canPublish` (what LiveKit would report). Nobody is connected unless a test says so;
   * `setCanPublish` updates the permission of whoever is.
   */
  readonly connected = new Map<string, boolean>();

  constructor(readonly url: string = 'ws://localhost:7880') {}

  createToken(request: MediaTokenRequest): Promise<string> {
    this.tokens.push(request);
    return Promise.resolve(`fake-token:${request.roomName}:${request.identity}`);
  }

  mutePublishedTracks(input: { roomName: string; identity: string }): Promise<void> {
    this.mutes.push(input);
    return Promise.resolve();
  }

  setCanPublish(input: { roomName: string; identity: string; canPublish: boolean }): Promise<void> {
    this.permissions.push(input);
    const key = `${input.roomName}:${input.identity}`;
    if (this.connected.has(key)) this.connected.set(key, input.canPublish);
    return Promise.resolve();
  }

  participantCanPublish(input: { roomName: string; identity: string }): Promise<boolean | null> {
    return Promise.resolve(this.connected.get(`${input.roomName}:${input.identity}`) ?? null);
  }

  removeParticipant(input: { roomName: string; identity: string }): Promise<void> {
    this.removals.push(input);
    return Promise.resolve();
  }
}
