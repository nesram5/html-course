import {
  AudioSource,
  LocalAudioTrack,
  Room,
  RoomEvent,
  TrackPublishOptions,
  TrackSource,
  dispose,
  type RemoteParticipant,
  type RemoteTrackPublication,
} from '@livekit/rtc-node';
import {
  API_PATHS,
  apiPath,
  mediaRoomName,
  MediaTokenResponseSchema,
  PROTOCOL_VERSION,
} from '@plaza/shared';
import { RoomServiceClient } from 'livekit-server-sdk';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { LiveKitMediaProvider, liveKitApiUrl } from '../../../adapters/livekit.js';
import { testConfig } from '../../../test/config.js';
import { resetDatabase } from '../../../test/db.js';
import { ManualTimers } from '../../../test/manual-timers.js';
import { RealtimeHarness, type TestClient } from '../../../test/realtime.js';
import type { TestUser } from '../../../test/session.js';

// E6-S3 end to end on the server: the real world module and a real `livekit-server --dev`
// (ws://localhost:7880, devkey/secret; override with LIVEKIT_URL / LIVEKIT_API_KEY /
// LIVEKIT_API_SECRET). Luis runs a MODIFIED client (`@livekit/rtc-node`) that never turns its
// media off by itself: only the server keeps the hallway from hearing him.
const { livekit } = testConfig({
  LIVEKIT_URL: process.env.LIVEKIT_URL ?? 'ws://localhost:7880',
  LIVEKIT_API_KEY: process.env.LIVEKIT_API_KEY ?? 'devkey',
  LIVEKIT_API_SECRET: process.env.LIVEKIT_API_SECRET ?? 'secret',
});
const admin = new RoomServiceClient(liveKitApiUrl(livekit.url), livekit.apiKey, livekit.apiSecret);

// office-small@1: the meeting room "sala-reuniones" is entered from (27,6) → (28,6).
const DOOR = { x: 27, y: 6 };
const INSIDE = { x: 28, y: 6 };

async function waitFor<T>(what: string, check: () => T | undefined, timeoutMs = 5000): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = check();
    if (value !== undefined) return value;
    if (Date.now() > deadline) throw new Error(`Timed out waiting for ${what}`);
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

async function waitForAsync(what: string, check: () => Promise<boolean>, timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs;
  while (!(await check())) {
    if (Date.now() > deadline) throw new Error(`Timed out waiting for ${what}`);
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}

function microphone(name: string): { track: LocalAudioTrack; options: TrackPublishOptions } {
  const options = new TrackPublishOptions();
  options.source = TrackSource.SOURCE_MICROPHONE;
  return { track: LocalAudioTrack.createAudioTrack(name, new AudioSource(48_000, 1)), options };
}

describe('meeting rooms isolate the media of a modified client (E6-S3, RNF-06)', () => {
  const timers = new ManualTimers();
  const harness = new RealtimeHarness({
    timers,
    overrides: { media: new LiveKitMediaProvider(livekit) },
  });
  const rooms: Room[] = [];
  let spaceId: string;
  let ana: TestUser;
  let luis: TestUser;

  beforeAll(async () => {
    await harness.start();
  });

  afterAll(async () => {
    await harness.stop();
    await dispose(); // releases the native WebRTC runtime of @livekit/rtc-node
  });

  beforeEach(async () => {
    await resetDatabase(harness.testApp.container.db);
    ana = await harness.signIn('ana@acme.com', 'Ana');
    luis = await harness.signIn('luis@acme.com', 'Luis');
    spaceId = (await harness.createSpace(ana, [luis])).id;
  });

  afterEach(async () => {
    await Promise.all(rooms.splice(0).map((room) => room.disconnect()));
    harness.reset();
  });

  /** Joins the space media room with a token from the real `POST …/media-token`. */
  async function connectMedia(user: TestUser): Promise<Room> {
    const response = await harness.testApp.app.inject({
      method: 'POST',
      url: apiPath(API_PATHS.mediaToken, { spaceId }),
      headers: user.headers,
    });
    const { url, token } = MediaTokenResponseSchema.parse(response.json());
    const room = new Room();
    rooms.push(room);
    await room.connect(url, token, { autoSubscribe: true, dynacast: false });
    return room;
  }

  function move(client: TestClient, tile: { x: number; y: number }): void {
    client.emit('player:move', { v: PROTOCOL_VERSION, ...tile, dir: 'right' });
  }

  function publicationsOf(room: Room, identity: string): RemoteTrackPublication[] {
    const participant: RemoteParticipant | undefined = room.remoteParticipants.get(identity);
    return participant === undefined ? [] : [...participant.trackPublications.values()];
  }

  async function serverSide(identity: string) {
    const info = await admin.getParticipant(mediaRoomName(spaceId), identity);
    return { canPublish: info.permission?.canPublish, tracks: info.tracks.length };
  }

  it('nobody in the hallway hears someone in a room, even if they publish again; outside they can', async () => {
    const luisWorld = await harness.enter(luis, spaceId);
    await harness.enter(ana, spaceId);
    harness.world.store.get(spaceId)?.place(luis.user.id, DOOR);

    const luisMedia = await connectMedia(luis);
    const anaMedia = await connectMedia(ana); // in the hallway, subscribed to Luis
    const subscribedByAna: string[] = [];
    const goneForAna: string[] = [];
    anaMedia.on(RoomEvent.TrackSubscribed, (_track, publication, participant) => {
      if (participant.identity === luis.user.id && publication.sid) {
        subscribedByAna.push(publication.sid);
      }
    });
    for (const event of [RoomEvent.TrackUnpublished, RoomEvent.TrackMuted] as const) {
      anaMedia.on(event, (publication: RemoteTrackPublication, participant: RemoteParticipant) => {
        if (participant.identity === luis.user.id && publication.sid) {
          goneForAna.push(publication.sid);
        }
      });
    }
    const first = microphone('mic-1');
    await luisMedia.localParticipant!.publishTrack(first.track, first.options);
    await waitFor('Ana to receive the microphone of Luis', () =>
      subscribedByAna.length === 1 ? true : undefined,
    );

    // Luis walks into the meeting room: within 500 ms the hallway no longer receives his audio.
    const started = Date.now();
    move(luisWorld.client, INSIDE);
    await waitFor('the hallway to lose the microphone of Luis', () =>
      goneForAna.length > 0 ? true : undefined,
    );
    expect(Date.now() - started).toBeLessThan(500);
    await waitForAsync('LiveKit to revoke the publish permission of Luis', async () => {
      const state = await serverSide(luis.user.id);
      return state.canPublish === false && state.tracks === 0;
    });
    expect(publicationsOf(anaMedia, luis.user.id)).toEqual([]);

    // His modified client publishes a new microphone from inside the room: LiveKit ignores it.
    const second = microphone('mic-2');
    const attempt = luisMedia.localParticipant!.publishTrack(second.track, second.options).then(
      () => 'published',
      () => 'refused',
    );
    await new Promise((resolve) => setTimeout(resolve, 1500));
    expect(subscribedByAna).toHaveLength(1);
    expect(publicationsOf(anaMedia, luis.user.id)).toEqual([]);
    expect(await serverSide(luis.user.id)).toEqual({ canPublish: false, tracks: 0 });

    // Back in the hallway: he may publish again (a permission, not a remote unmute).
    move(luisWorld.client, DOOR);
    await waitForAsync('LiveKit to grant publishing back', async () => {
      return (await serverSide(luis.user.id)).canPublish === true;
    });
    expect((await serverSide(luis.user.id)).tracks).toBe(0); // nothing was unmuted remotely
    // The SDK gives up on the refused publication after its own timeout.
    await Promise.race([attempt, new Promise((resolve) => setTimeout(resolve, 20_000))]);
    const third = microphone('mic-3');
    await luisMedia.localParticipant!.publishTrack(third.track, third.options);
    await waitFor('Ana to receive the new microphone of Luis', () =>
      subscribedByAna.length >= 2 ? true : undefined,
    );
    expect((await serverSide(luis.user.id)).tracks).toBeGreaterThan(0);
  }, 60_000);

  it('a token issued inside a room does not allow publishing', async () => {
    const luisWorld = await harness.enter(luis, spaceId);
    harness.world.store.get(spaceId)?.place(luis.user.id, DOOR);
    move(luisWorld.client, INSIDE);
    await harness.barrier(spaceId, luisWorld.client);

    await connectMedia(luis);

    expect(await serverSide(luis.user.id)).toEqual({ canPublish: false, tracks: 0 });
  });
});
