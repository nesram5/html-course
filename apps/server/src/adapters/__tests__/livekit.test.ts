import { MEDIA_TOKEN_TTL_SECONDS } from '@bululu/shared';
import {
  ParticipantInfo,
  ParticipantPermission,
  TokenVerifier,
  TrackInfo,
  TrackType,
  ServerError,
  type RoomServiceClient,
} from 'livekit-server-sdk';
import { describe, expect, it } from 'vitest';

import { AppError } from '../../platform/errors.js';
import { LiveKitMediaProvider, liveKitApiUrl, type LiveKitRoomService } from '../livekit.js';

const config = { url: 'wss://lk.example.com', apiKey: 'key-1', apiSecret: 'secret-1'.repeat(4) };

/** In-memory RoomService: one participant with the given tracks; records mute calls. */
class FakeRoomService implements LiveKitRoomService {
  readonly muted: { room: string; identity: string; trackSid: string; muted: boolean }[] = [];
  readonly removed: { room: string; identity: string }[] = [];
  readonly updated: { room: string; identity: string; options: unknown }[] = [];
  failWith: Error | null = null;

  constructor(
    private readonly tracks: TrackInfo[],
    private readonly permission?: ParticipantPermission,
  ) {}

  getParticipant: RoomServiceClient['getParticipant'] = (room, identity) => {
    if (this.failWith !== null) return Promise.reject(this.failWith);
    return Promise.resolve(
      new ParticipantInfo({
        identity,
        tracks: this.tracks,
        name: room,
        ...(this.permission && { permission: this.permission }),
      }),
    );
  };

  mutePublishedTrack: RoomServiceClient['mutePublishedTrack'] = (
    room,
    identity,
    trackSid,
    muted,
  ) => {
    this.muted.push({ room, identity, trackSid, muted });
    return Promise.resolve(new TrackInfo({ sid: trackSid, muted }));
  };

  updateParticipant = ((room: string, identity: string, options: unknown) => {
    if (this.failWith !== null) return Promise.reject(this.failWith);
    this.updated.push({ room, identity, options });
    return Promise.resolve(new ParticipantInfo({ identity }));
  }) as RoomServiceClient['updateParticipant'];

  removeParticipant: RoomServiceClient['removeParticipant'] = (room, identity) => {
    if (this.failWith !== null) return Promise.reject(this.failWith);
    this.removed.push({ room, identity });
    return Promise.resolve();
  };
}

describe('liveKitApiUrl', () => {
  it('maps the client WebSocket URL to the server API URL', () => {
    expect(liveKitApiUrl('ws://localhost:7880')).toBe('http://localhost:7880');
    expect(liveKitApiUrl('wss://lk.example.com')).toBe('https://lk.example.com');
  });
});

describe('LiveKitMediaProvider.createToken (E5-S3)', () => {
  const provider = new LiveKitMediaProvider(config, { roomService: new FakeRoomService([]) });
  const request = {
    roomName: 'space_abc',
    identity: 'user-1',
    displayName: 'Ana',
    ttlSeconds: MEDIA_TOKEN_TTL_SECONDS,
  };

  it('exposes the client URL', () => {
    expect(provider.url).toBe('wss://lk.example.com');
  });

  it('issues a token for the space room, identity = userId, valid 10 min, without admin grants', async () => {
    const token = await provider.createToken(request);
    const claims = await new TokenVerifier(config.apiKey, config.apiSecret).verify(token);

    expect(claims.sub).toBe('user-1');
    expect(claims.name).toBe('Ana');
    expect(claims.iss).toBe(config.apiKey);
    expect(claims.exp! - claims.nbf!).toBe(MEDIA_TOKEN_TTL_SECONDS);
    expect(MEDIA_TOKEN_TTL_SECONDS).toBe(600);
    expect(claims.video).toEqual({
      room: 'space_abc',
      roomJoin: true,
      canPublish: true,
      canSubscribe: true,
      canPublishData: false,
      canUpdateOwnMetadata: false,
      roomAdmin: false,
      roomCreate: false,
      roomList: false,
      roomRecord: false,
      hidden: false,
    });
    // Nothing beyond joining one room.
    expect(claims.sip).toBeUndefined();
    expect(claims.video?.ingressAdmin).toBeUndefined();
    expect(claims.video?.agent).toBeUndefined();
  });

  it('issues a token that may not publish for someone who is in a meeting room (E6-S3)', async () => {
    const token = await provider.createToken({ ...request, canPublish: false });
    const claims = await new TokenVerifier(config.apiKey, config.apiSecret).verify(token);

    expect(claims.video).toMatchObject({ canPublish: false, canSubscribe: true, roomJoin: true });
  });

  it('signs with the configured secret', async () => {
    const token = await provider.createToken(request);
    await expect(
      new TokenVerifier(config.apiKey, 'another-secret'.repeat(3)).verify(token),
    ).rejects.toThrow();
  });
});

describe('LiveKitMediaProvider.mutePublishedTracks (E6-S3)', () => {
  const tracks = [
    new TrackInfo({ sid: 'TR_mic', type: TrackType.AUDIO }),
    new TrackInfo({ sid: 'TR_cam', type: TrackType.VIDEO }),
    new TrackInfo({ sid: 'TR_screen', type: TrackType.VIDEO, muted: true }),
    new TrackInfo({ sid: 'TR_data', type: TrackType.DATA }),
  ];

  it('mutes every audio and video track of the participant', async () => {
    const rooms = new FakeRoomService(tracks);
    const provider = new LiveKitMediaProvider(config, { roomService: rooms });

    await provider.mutePublishedTracks({ roomName: 'space_abc', identity: 'user-1' });

    expect(rooms.muted).toEqual([
      { room: 'space_abc', identity: 'user-1', trackSid: 'TR_mic', muted: true },
      { room: 'space_abc', identity: 'user-1', trackSid: 'TR_cam', muted: true },
      { room: 'space_abc', identity: 'user-1', trackSid: 'TR_screen', muted: true },
    ]);
  });

  it('does nothing when the participant is not connected to the media server', async () => {
    const rooms = new FakeRoomService(tracks);
    rooms.failWith = new ServerError('ServerError', 'participant not found', 404, 'not_found');
    const provider = new LiveKitMediaProvider(config, { roomService: rooms });

    await expect(
      provider.mutePublishedTracks({ roomName: 'space_abc', identity: 'user-1' }),
    ).resolves.toBeUndefined();
    expect(rooms.muted).toEqual([]);
  });

  it('reports other media server failures as MEDIA_PROVIDER_ERROR', async () => {
    const rooms = new FakeRoomService(tracks);
    rooms.failWith = new Error('connect ECONNREFUSED');
    const provider = new LiveKitMediaProvider(config, { roomService: rooms });

    const error = await provider
      .mutePublishedTracks({ roomName: 'space_abc', identity: 'user-1' })
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(AppError);
    expect(error).toMatchObject({ code: 'MEDIA_PROVIDER_ERROR', httpStatus: 502 });
  });

  it('builds its own RoomServiceClient from the configuration', () => {
    expect(new LiveKitMediaProvider(config).url).toBe(config.url);
  });
});

describe('LiveKitMediaProvider.removeParticipant (E2-S6 kick)', () => {
  it('removes the participant from the room', async () => {
    const rooms = new FakeRoomService([]);
    const provider = new LiveKitMediaProvider(config, { roomService: rooms });

    await provider.removeParticipant({ roomName: 'space_abc', identity: 'user-1' });

    expect(rooms.removed).toEqual([{ room: 'space_abc', identity: 'user-1' }]);
  });

  it('does nothing when the participant is not connected to the media server', async () => {
    const rooms = new FakeRoomService([]);
    rooms.failWith = new ServerError('ServerError', 'participant not found', 404, 'not_found');
    const provider = new LiveKitMediaProvider(config, { roomService: rooms });

    await expect(
      provider.removeParticipant({ roomName: 'space_abc', identity: 'user-1' }),
    ).resolves.toBeUndefined();
  });

  it('reports other media server failures as MEDIA_PROVIDER_ERROR', async () => {
    const rooms = new FakeRoomService([]);
    rooms.failWith = new Error('connect ECONNREFUSED');
    const provider = new LiveKitMediaProvider(config, { roomService: rooms });

    await expect(
      provider.removeParticipant({ roomName: 'space_abc', identity: 'user-1' }),
    ).rejects.toMatchObject({ code: 'MEDIA_PROVIDER_ERROR', httpStatus: 502 });
  });
});

describe('LiveKitMediaProvider.setCanPublish (E6-S3)', () => {
  it('revokes and grants back publishing, keeping the rest of the token permission', async () => {
    const rooms = new FakeRoomService([]);
    const provider = new LiveKitMediaProvider(config, { roomService: rooms });

    await provider.setCanPublish({ roomName: 'space_abc', identity: 'user-1', canPublish: false });
    await provider.setCanPublish({ roomName: 'space_abc', identity: 'user-1', canPublish: true });

    const permission = (canPublish: boolean) => ({
      permission: {
        canPublish,
        canSubscribe: true,
        canPublishData: false,
        canUpdateMetadata: false,
        hidden: false,
      },
    });
    expect(rooms.updated).toEqual([
      { room: 'space_abc', identity: 'user-1', options: permission(false) },
      { room: 'space_abc', identity: 'user-1', options: permission(true) },
    ]);
  });

  it('does nothing when the participant is not connected to the media server', async () => {
    const rooms = new FakeRoomService([]);
    rooms.failWith = new ServerError('ServerError', 'participant not found', 404, 'not_found');
    const provider = new LiveKitMediaProvider(config, { roomService: rooms });

    await expect(
      provider.setCanPublish({ roomName: 'space_abc', identity: 'user-1', canPublish: false }),
    ).resolves.toBeUndefined();
  });

  it('reports other media server failures as MEDIA_PROVIDER_ERROR', async () => {
    const rooms = new FakeRoomService([]);
    rooms.failWith = new Error('connect ECONNREFUSED');
    const provider = new LiveKitMediaProvider(config, { roomService: rooms });

    await expect(
      provider.setCanPublish({ roomName: 'space_abc', identity: 'user-1', canPublish: false }),
    ).rejects.toMatchObject({ code: 'MEDIA_PROVIDER_ERROR', httpStatus: 502 });
  });
});

describe('LiveKitMediaProvider.participantCanPublish (E6-S3)', () => {
  const target = { roomName: 'space_abc', identity: 'user-1' };

  it('reports the permission the media server holds for the participant', async () => {
    const revoked = new FakeRoomService([], new ParticipantPermission({ canPublish: false }));
    const granted = new FakeRoomService([], new ParticipantPermission({ canPublish: true }));

    expect(
      await new LiveKitMediaProvider(config, { roomService: revoked }).participantCanPublish(
        target,
      ),
    ).toBe(false);
    expect(
      await new LiveKitMediaProvider(config, { roomService: granted }).participantCanPublish(
        target,
      ),
    ).toBe(true);
  });

  it('answers null when the participant is not connected, and reports other failures', async () => {
    const absent = new FakeRoomService([]);
    absent.failWith = new ServerError('ServerError', 'participant not found', 404, 'not_found');
    const broken = new FakeRoomService([]);
    broken.failWith = new Error('connect ECONNREFUSED');

    expect(
      await new LiveKitMediaProvider(config, { roomService: absent }).participantCanPublish(target),
    ).toBeNull();
    await expect(
      new LiveKitMediaProvider(config, { roomService: broken }).participantCanPublish(target),
    ).rejects.toMatchObject({ code: 'MEDIA_PROVIDER_ERROR' });
  });
});
