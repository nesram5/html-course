import {
  AccessToken,
  RoomServiceClient,
  TrackType,
  ServerError,
  type VideoGrant,
} from 'livekit-server-sdk';

import { AppError } from '../platform/errors.js';
import type { MediaProvider, MediaTokenRequest } from './media-provider.js';

export interface LiveKitConfig {
  /** `LIVEKIT_URL`: WebSocket URL for clients (`ws://` or `wss://`). */
  url: string;
  apiKey: string;
  apiSecret: string;
}

/** The part of LiveKit's `RoomServiceClient` this adapter uses (replaceable in unit tests). */
export type LiveKitRoomService = Pick<
  RoomServiceClient,
  'getParticipant' | 'mutePublishedTrack' | 'removeParticipant' | 'updateParticipant'
>;

/** Media tracks muted when entering a meeting room (camera, microphone and screen share). */
const MUTED_TRACK_TYPES: ReadonlySet<TrackType> = new Set([TrackType.AUDIO, TrackType.VIDEO]);

/** LiveKit's server API speaks HTTP(S) on the same host as the client WebSocket. */
export function liveKitApiUrl(url: string): string {
  return url.replace(/^ws(s?):\/\//, 'http$1://');
}

/** `true` when the participant (or its room) is not on the media server. */
function isNotFound(error: unknown): boolean {
  return error instanceof ServerError && (error.status === 404 || error.code === 'not_found');
}

/**
 * Real media server adapter (ADR-003, E5-S3, E6-S3) on top of `livekit-server-sdk`.
 * Works the same against LiveKit Cloud, the self-hosted server (E5-S7) and `livekit-server --dev`.
 */
export class LiveKitMediaProvider implements MediaProvider {
  readonly url: string;
  readonly #apiKey: string;
  readonly #apiSecret: string;
  readonly #rooms: LiveKitRoomService;

  constructor(config: LiveKitConfig, options: { roomService?: LiveKitRoomService } = {}) {
    this.url = config.url;
    this.#apiKey = config.apiKey;
    this.#apiSecret = config.apiSecret;
    this.#rooms =
      options.roomService ??
      new RoomServiceClient(liveKitApiUrl(config.url), config.apiKey, config.apiSecret);
  }

  /**
   * Join token for one room: identity = userId, may publish and subscribe media, nothing else
   * (no admin, room creation/listing/recording, data messages or metadata updates).
   */
  async createToken(request: MediaTokenRequest): Promise<string> {
    const token = new AccessToken(this.#apiKey, this.#apiSecret, {
      identity: request.identity,
      name: request.displayName,
      ttl: request.ttlSeconds,
    });
    const grant: VideoGrant = {
      room: request.roomName,
      roomJoin: true,
      canPublish: request.canPublish ?? true,
      canSubscribe: true,
      canPublishData: false,
      canUpdateOwnMetadata: false,
      roomAdmin: false,
      roomCreate: false,
      roomList: false,
      roomRecord: false,
      hidden: false,
    };
    token.addGrant(grant);
    return token.toJwt();
  }

  /**
   * Server-side mute of every audio and video track the participant publishes (E6-S3, RNF-06),
   * so nobody in the hallway keeps hearing or seeing someone who entered a meeting room, even
   * with a misbehaving client. Only the client unmutes afterwards. No-op when the person is not
   * connected to the media server.
   */
  async mutePublishedTracks(input: { roomName: string; identity: string }): Promise<void> {
    const { roomName, identity } = input;
    try {
      const participant = await this.#rooms.getParticipant(roomName, identity);
      const tracks = participant.tracks.filter((track) => MUTED_TRACK_TYPES.has(track.type));
      await Promise.all(
        tracks.map((track) => this.#rooms.mutePublishedTrack(roomName, identity, track.sid, true)),
      );
    } catch (error) {
      if (isNotFound(error)) return;
      throw new AppError('MEDIA_PROVIDER_ERROR', 'Could not mute the participant tracks', {
        cause: error,
      });
    }
  }

  /**
   * Grants or revokes publishing (E6-S3). LiveKit unpublishes every track of a participant who
   * loses `canPublish` and ignores their new publications until it is granted back. The rest of
   * the permission is the one of {@link createToken} (the update replaces it whole). No-op when
   * the person is not connected.
   */
  async setCanPublish(input: {
    roomName: string;
    identity: string;
    canPublish: boolean;
  }): Promise<void> {
    try {
      await this.#rooms.updateParticipant(input.roomName, input.identity, {
        permission: {
          canPublish: input.canPublish,
          canSubscribe: true,
          canPublishData: false,
          canUpdateMetadata: false,
          hidden: false,
        },
      });
    } catch (error) {
      if (isNotFound(error)) return;
      throw new AppError('MEDIA_PROVIDER_ERROR', 'Could not change the publish permission', {
        cause: error,
      });
    }
  }

  /** Current `canPublish` of the participant; `null` when they are not connected. */
  async participantCanPublish(input: {
    roomName: string;
    identity: string;
  }): Promise<boolean | null> {
    try {
      const participant = await this.#rooms.getParticipant(input.roomName, input.identity);
      return participant.permission?.canPublish ?? true;
    } catch (error) {
      if (isNotFound(error)) return null;
      throw new AppError('MEDIA_PROVIDER_ERROR', 'Could not read the participant permission', {
        cause: error,
      });
    }
  }

  /**
   * Removes the participant from the room (a member kicked out of the space, E2-S6). The token
   * they hold is still valid for its remaining lifetime (at most `MEDIA_TOKEN_TTL_SECONDS`,
   * 10 min), but the media-token endpoint refuses non-members, so they cannot get a new one.
   * No-op when the person is not connected.
   */
  async removeParticipant(input: { roomName: string; identity: string }): Promise<void> {
    try {
      await this.#rooms.removeParticipant(input.roomName, input.identity);
    } catch (error) {
      if (isNotFound(error)) return;
      throw new AppError('MEDIA_PROVIDER_ERROR', 'Could not remove the participant', {
        cause: error,
      });
    }
  }
}
