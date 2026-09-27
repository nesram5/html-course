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
  /** Who is in a meeting room right now (set by the world module, which knows `roomId`). */
  #inMeetingRoom: (spaceId: string, userId: string) => boolean = () => false;

  constructor(deps: { members: MediaMembers; media: MediaProvider }) {
    this.#members = deps.members;
    this.#media = deps.media;
  }

  /**
   * E5-S3: join token for the space's media room, valid {@link MEDIA_TOKEN_TTL_SECONDS} (10 min),
   * without admin grants; the client asks for a new one before it expires. Short-lived so that a
   * member removed from the space (disconnected from the room on the kick) cannot rejoin with a
   * token they kept. Non-members get `NOT_A_MEMBER` (404, the space's existence is not leaked).
   */
  async issueToken(spaceId: string, userId: string): Promise<MediaTokenResponse> {
    const displayName = await this.#members.findMemberDisplayName(spaceId, userId);
    if (displayName === null) throw new AppError('NOT_A_MEMBER');
    const token = await this.#media.createToken({
      roomName: mediaRoomName(spaceId),
      identity: userId,
      displayName,
      ttlSeconds: MEDIA_TOKEN_TTL_SECONDS,
      // Someone (re)connecting to the media server from inside a meeting room may not publish
      // until they walk out (E6-S3): `leaveMeetingRoom` grants it back.
      canPublish: !this.#inMeetingRoom(spaceId, userId),
    });
    return { url: this.#media.url, token, expiresInSeconds: MEDIA_TOKEN_TTL_SECONDS };
  }

  /**
   * Tells the service who is in a meeting room, so the tokens it issues to them do not allow
   * publishing (E6-S3). Registered once by the world module.
   */
  trackMeetingRooms(inMeetingRoom: (spaceId: string, userId: string) => boolean): void {
    this.#inMeetingRoom = inMeetingRoom;
  }

  /**
   * E6-S3: the person walked into a meeting room. Their hallway audio and video are muted
   * server-side and their permission to publish is revoked (RNF-06), so nobody in the hallway
   * hears or sees them even if their client does not turn its media off, nor publishes new
   * tracks. Both are attempted even if one fails; the first failure is rethrown
   * (`MEDIA_PROVIDER_ERROR`).
   */
  async enterMeetingRoom(spaceId: string, userId: string): Promise<void> {
    const target = { roomName: mediaRoomName(spaceId), identity: userId };
    const results = await Promise.allSettled([
      this.#media.mutePublishedTracks(target),
      this.#media.setCanPublish({ ...target, canPublish: false }),
    ]);
    for (const result of results) if (result.status === 'rejected') throw result.reason;
  }

  /**
   * E6-S3: the person walked out of the meeting room (or left the space from inside it): they
   * may publish again. It is a permission, not a remote unmute: their client turns its media
   * back on by itself.
   */
  leaveMeetingRoom(spaceId: string, userId: string): Promise<void> {
    return this.#media.setCanPublish({
      roomName: mediaRoomName(spaceId),
      identity: userId,
      canPublish: true,
    });
  }

  /**
   * E6-S3: server-side mute of the person's hallway audio and video when they enter a meeting
   * room (RNF-06), part of {@link enterMeetingRoom}; the server never unmutes.
   * Rejects with `MEDIA_PROVIDER_ERROR` if LiveKit fails: callers on the realtime path should
   * log and report it instead of rejecting the move.
   */
  muteParticipantTracks(spaceId: string, userId: string): Promise<void> {
    return this.#media.mutePublishedTracks({ roomName: mediaRoomName(spaceId), identity: userId });
  }

  /**
   * Disconnects a member removed from the space (E2-S6) from the space's media room, so they stop
   * hearing the hallway at once. Rejects with `MEDIA_PROVIDER_ERROR` if LiveKit fails.
   */
  removeParticipant(spaceId: string, userId: string): Promise<void> {
    return this.#media.removeParticipant({ roomName: mediaRoomName(spaceId), identity: userId });
  }
}
