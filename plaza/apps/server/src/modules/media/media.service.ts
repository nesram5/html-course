import { MEDIA_TOKEN_TTL_SECONDS, mediaRoomName, type MediaTokenResponse } from '@plaza/shared';

import type { MediaProvider } from '../../adapters/media-provider.js';
import { AppError } from '../../platform/errors.js';

/** Membership lookup needed by the media use cases. */
export interface MediaMembers {
  /** Display name of the member, or `null` when the person is not a member of the space. */
  findMemberDisplayName(spaceId: string, userId: string): Promise<string | null>;
}

/**
 * Media use cases (architecture §10.2): one LiveKit room per space (`space_<spaceId>`),
 * identity = userId.
 */
export class MediaService {
  readonly #members: MediaMembers;
  readonly #media: MediaProvider;

  constructor(deps: { members: MediaMembers; media: MediaProvider }) {
    this.#members = deps.members;
    this.#media = deps.media;
  }

  /**
   * E5-S3: join token for the space's media room, valid 1 h, without admin grants.
   * Non-members get `NOT_A_MEMBER` (404, the space's existence is not leaked).
   */
  async issueToken(spaceId: string, userId: string): Promise<MediaTokenResponse> {
    const displayName = await this.#members.findMemberDisplayName(spaceId, userId);
    if (displayName === null) throw new AppError('NOT_A_MEMBER');
    const token = await this.#media.createToken({
      roomName: mediaRoomName(spaceId),
      identity: userId,
      displayName,
      ttlSeconds: MEDIA_TOKEN_TTL_SECONDS,
    });
    return { url: this.#media.url, token };
  }

  /**
   * E6-S3: server-side mute of the person's hallway audio and video when they enter a meeting
   * room (RNF-06). Call it as soon as `roomId` becomes non-null; the server never unmutes.
   * Rejects with `MEDIA_PROVIDER_ERROR` if LiveKit fails: callers on the realtime path should
   * log and report it instead of rejecting the move.
   */
  muteParticipantTracks(spaceId: string, userId: string): Promise<void> {
    return this.#media.mutePublishedTracks({ roomName: mediaRoomName(spaceId), identity: userId });
  }
}
