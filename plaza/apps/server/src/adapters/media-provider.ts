/**
 * Media server port (ADR-003, E5-S3, E6-S3). The real implementation is LiveKit
 * (`livekit.ts` with `livekit-server-sdk`, TODO E5-S3); tests use `FakeMediaProvider`.
 */
export interface MediaTokenRequest {
  /** `space_<spaceId>` (see `mediaRoomName`). */
  roomName: string;
  /** userId. */
  identity: string;
  displayName: string;
  ttlSeconds: number;
}

export interface MediaProvider {
  /** WebSocket URL clients connect to (`LIVEKIT_URL`). */
  readonly url: string;
  /** Join token without admin grants (E5-S3). */
  createToken(request: MediaTokenRequest): Promise<string>;
  /** Server-side mute of the participant's published audio and video (E6-S3, RNF-06). */
  mutePublishedTracks(input: { roomName: string; identity: string }): Promise<void>;
}
