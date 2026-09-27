/**
 * Media server port (ADR-003, E5-S3, E6-S3). The real implementation is LiveKit
 * (`LiveKitMediaProvider` in `livekit.ts`); tests use `FakeMediaProvider`.
 */
export interface MediaTokenRequest {
  /** `space_<spaceId>` (see `mediaRoomName`). */
  roomName: string;
  /** userId. */
  identity: string;
  displayName: string;
  ttlSeconds: number;
  /**
   * May publish media (default `true`). `false` for someone who is in a meeting room when they
   * connect (E6-S3): they may listen to nobody's hallway and must not be heard either.
   */
  canPublish?: boolean;
}

export interface MediaProvider {
  /** WebSocket URL clients connect to (`LIVEKIT_URL`). */
  readonly url: string;
  /** Join token without admin grants (E5-S3). */
  createToken(request: MediaTokenRequest): Promise<string>;
  /**
   * Server-side mute of the participant's published audio and video (E6-S3, RNF-06).
   * Resolves without doing anything when the person is not connected to the media server;
   * rejects with `AppError('MEDIA_PROVIDER_ERROR')` when the media server fails.
   */
  mutePublishedTracks(input: { roomName: string; identity: string }): Promise<void>;
  /**
   * Grants or revokes the participant's permission to publish media (E6-S3). Revoking it
   * unpublishes every track they have and refuses new ones, so even a modified client cannot be
   * heard; granting it back only allows publishing (the client republishes by itself, the server
   * never unmutes anyone). Resolves without doing anything when the person is not connected;
   * rejects with `AppError('MEDIA_PROVIDER_ERROR')` when the media server fails.
   */
  setCanPublish(input: { roomName: string; identity: string; canPublish: boolean }): Promise<void>;
  /**
   * Disconnects the participant from the media room (a member removed from the space, E2-S6):
   * they stop hearing and seeing the hallway at once, even with a misbehaving client. Resolves
   * without doing anything when the person is not connected; rejects with
   * `AppError('MEDIA_PROVIDER_ERROR')` when the media server fails.
   */
  removeParticipant(input: { roomName: string; identity: string }): Promise<void>;
}
