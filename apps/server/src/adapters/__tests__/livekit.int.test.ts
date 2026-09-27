import { randomUUID } from 'node:crypto';

import {
  AudioSource,
  LocalAudioTrack,
  LocalVideoTrack,
  Room,
  RoomEvent,
  TrackPublishOptions,
  TrackSource,
  VideoSource,
  dispose,
  type RemoteParticipant,
  type RemoteTrackPublication,
} from '@livekit/rtc-node';
import { MEDIA_TOKEN_TTL_SECONDS, mediaRoomName } from '@plaza/shared';
import { RoomServiceClient, TrackType } from 'livekit-server-sdk';
import { afterAll, afterEach, describe, expect, it } from 'vitest';

import { MediaService } from '../../modules/media/media.service.js';
import { testConfig } from '../../test/config.js';
import { LiveKitMediaProvider, liveKitApiUrl } from '../livekit.js';

// Real `livekit-server --dev` (ws://localhost:7880, devkey/secret; CI starts it). Override the
// connection with LIVEKIT_URL / LIVEKIT_API_KEY / LIVEKIT_API_SECRET.
const { livekit } = testConfig({
  LIVEKIT_URL: process.env.LIVEKIT_URL ?? 'ws://localhost:7880',
  LIVEKIT_API_KEY: process.env.LIVEKIT_API_KEY ?? 'devkey',
  LIVEKIT_API_SECRET: process.env.LIVEKIT_API_SECRET ?? 'secret',
});
const provider = new LiveKitMediaProvider(livekit);
const admin = new RoomServiceClient(liveKitApiUrl(livekit.url), livekit.apiKey, livekit.apiSecret);

const rooms: Room[] = [];

afterEach(async () => {
  await Promise.all(rooms.splice(0).map((room) => room.disconnect()));
});

afterAll(async () => {
  await dispose(); // releases the native WebRTC runtime of @livekit/rtc-node
});

async function join(roomName: string, userId: string): Promise<Room> {
  const token = await provider.createToken({
    roomName,
    identity: userId,
    displayName: `Name ${userId}`,
    ttlSeconds: MEDIA_TOKEN_TTL_SECONDS,
  });
  const room = new Room();
  rooms.push(room);
  await room.connect(provider.url, token, { autoSubscribe: true, dynacast: false });
  return room;
}

/** Publishes a microphone and a camera track (no frames needed for the SFU to list them). */
async function publishMicAndCamera(room: Room): Promise<void> {
  const mic = LocalAudioTrack.createAudioTrack('mic', new AudioSource(48_000, 1));
  const cam = LocalVideoTrack.createVideoTrack('cam', new VideoSource(320, 240));
  const micOptions = new TrackPublishOptions();
  micOptions.source = TrackSource.SOURCE_MICROPHONE;
  const camOptions = new TrackPublishOptions();
  camOptions.source = TrackSource.SOURCE_CAMERA;
  await room.localParticipant!.publishTrack(mic, micOptions);
  await room.localParticipant!.publishTrack(cam, camOptions);
}

async function waitFor<T>(what: string, check: () => T | undefined, timeoutMs = 5000): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = check();
    if (value !== undefined) return value;
    if (Date.now() > deadline) throw new Error(`Timed out waiting for ${what}`);
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}

function publicationsOf(room: Room, identity: string): RemoteTrackPublication[] {
  const participant: RemoteParticipant | undefined = room.remoteParticipants.get(identity);
  return participant === undefined ? [] : [...participant.trackPublications.values()];
}

describe('LiveKitMediaProvider against a real LiveKit server', () => {
  it('issues tokens LiveKit accepts: identity = userId, may publish/subscribe, no data or admin', async () => {
    const roomName = mediaRoomName(`it-${randomUUID()}`);
    await join(roomName, 'user-ana');

    const participants = await admin.listParticipants(roomName);
    expect(participants.map((p) => [p.identity, p.name])).toEqual([['user-ana', 'Name user-ana']]);
    const permission = participants[0]!.permission!;
    expect(permission.canPublish).toBe(true);
    expect(permission.canSubscribe).toBe(true);
    expect(permission.canPublishData).toBe(false);
    expect(permission.hidden).toBe(false);
  });

  it('mutes the published audio and video of a participant: the hallway sees them muted (E6-S3)', async () => {
    const spaceId = `it-${randomUUID()}`;
    const roomName = mediaRoomName(spaceId);
    const luis = await join(roomName, 'user-luis');
    const ana = await join(roomName, 'user-ana'); // in the hallway, subscribed to Luis
    await publishMicAndCamera(luis);

    const seenByAna = await waitFor('Ana to see both tracks of Luis', () => {
      const pubs = publicationsOf(ana, 'user-luis');
      return pubs.length === 2 ? pubs : undefined;
    });
    expect(seenByAna.every((pub) => pub.muted !== true)).toBe(true);

    const mutedForAna = new Set<string>();
    ana.on(RoomEvent.TrackMuted, (publication, participant) => {
      if (participant.identity === 'user-luis' && publication.sid) mutedForAna.add(publication.sid);
    });

    const started = Date.now();
    // Luis enters a meeting room. A modified client would keep publishing: only the server-side
    // mute of the media module (what the world module calls on room entry) is exercised here.
    const media = new MediaService({
      members: { findMemberDisplayName: () => Promise.resolve(null) },
      media: provider,
    });
    await media.muteParticipantTracks(spaceId, 'user-luis');

    await waitFor('Ana to receive the mute of both tracks', () =>
      mutedForAna.size === 2 ? true : undefined,
    );
    expect(Date.now() - started).toBeLessThan(500);
    expect(publicationsOf(ana, 'user-luis').every((pub) => pub.muted === true)).toBe(true);

    // Luis's own client is told as well, and the server state agrees.
    await waitFor('Luis to see his tracks muted', () =>
      [...luis.localParticipant!.trackPublications.values()].every((pub) => pub.muted === true)
        ? true
        : undefined,
    );
    const info = await admin.getParticipant(roomName, 'user-luis');
    const mediaTracks = info.tracks.filter(
      (t) => t.type === TrackType.AUDIO || t.type === TrackType.VIDEO,
    );
    expect(mediaTracks).toHaveLength(2);
    expect(mediaTracks.every((t) => t.muted)).toBe(true);
  });

  it('is a no-op for someone who is not connected to the media server', async () => {
    const roomName = mediaRoomName(`it-${randomUUID()}`);
    await join(roomName, 'user-ana');
    await expect(
      provider.mutePublishedTracks({ roomName, identity: 'user-nobody' }),
    ).resolves.toBeUndefined();
    await expect(
      provider.mutePublishedTracks({ roomName: mediaRoomName('missing'), identity: 'user-ana' }),
    ).resolves.toBeUndefined();
  });

  it('removes a participant from the room and ignores people who are not connected (E2-S6)', async () => {
    const roomName = mediaRoomName(`it-${randomUUID()}`);
    await join(roomName, 'user-ana');
    const luis = await join(roomName, 'user-luis');
    const luisDisconnected = new Promise<void>((resolve) => {
      luis.on(RoomEvent.Disconnected, () => {
        resolve();
      });
    });

    await provider.removeParticipant({ roomName, identity: 'user-luis' });

    await luisDisconnected;
    const participants = await admin.listParticipants(roomName);
    expect(participants.map((p) => p.identity)).toEqual(['user-ana']);
    await expect(
      provider.removeParticipant({ roomName, identity: 'user-nobody' }),
    ).resolves.toBeUndefined();
  });
});
