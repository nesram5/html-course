import {
  MEDIA_TOKEN_REFRESH_MARGIN_SECONDS,
  MEDIA_TOKEN_TTL_SECONDS,
  type MediaTokenResponse,
  type SpaceSnapshot,
} from '@bululu/shared';
import { DisconnectReason, RoomEvent, VideoQuality } from 'livekit-client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { EventBus } from '@/features/world';
import { ApiError } from '@/shared/api';

import {
  FIRST_FRAME_TIMING,
  MediaController,
  PUBLISH_ATTEMPTS,
  PUBLISH_RETRY_MS,
  RECONNECT_DELAYS_MS,
  ROOM_EXIT_SETTLE_MS,
  TOKEN_FRESH_MS,
} from '../controller/media-controller';
import { DEFAULT_MEDIA_CHOICES, type MediaChoices } from '../lib/media-prefs';
import { createMediaStore, type MediaStore } from '../store/media-store';
import { FakeAudioTrack, FakeRealtime, FakeRoom } from './fake-room';

let realtime: FakeRealtime;
let events: EventBus;
let store: MediaStore;
let rooms: FakeRoom[];
let tokens: MediaTokenResponse[];
let fetchToken: ReturnType<typeof vi.fn<(spaceId: string) => Promise<MediaTokenResponse>>>;
let timings: [string, number][];
let clock: number;
let controller: MediaController;

function room(): FakeRoom {
  const last = rooms.at(-1);
  if (last === undefined) throw new Error('no room');
  return last;
}

async function settle(): Promise<void> {
  for (let i = 0; i < 10; i++) await Promise.resolve();
}

async function started(choices: MediaChoices = DEFAULT_MEDIA_CHOICES): Promise<FakeRoom> {
  controller.start('space-1', choices);
  await settle();
  return room();
}

beforeEach(() => {
  vi.useFakeTimers();
  realtime = new FakeRealtime();
  events = new EventBus();
  store = createMediaStore();
  rooms = [];
  tokens = [];
  timings = [];
  clock = 1000;
  let issued = 0;
  fetchToken = vi.fn(() => {
    issued++;
    const token = {
      url: 'ws://lk.test',
      token: `token-${String(issued)}`,
      expiresInSeconds: MEDIA_TOKEN_TTL_SECONDS,
    };
    tokens.push(token);
    return Promise.resolve(token);
  });
  controller = new MediaController({
    realtime: realtime.asRealtime(),
    events,
    store,
    fetchToken,
    createRoom: (options) => {
      const created = new FakeRoom(options);
      rooms.push(created);
      return created.asRoom();
    },
    now: () => clock,
    reportTiming: (name, ms) => timings.push([name, ms]),
  });
});

afterEach(() => {
  controller.stop();
  vi.useRealTimers();
});

describe('MediaController: connecting and publishing (E5-S5)', () => {
  it('connects with autoSubscribe off, adaptive stream, dynacast and simulcast, then publishes', async () => {
    const lk = await started();

    expect(fetchToken).toHaveBeenCalledWith('space-1');
    expect(lk.connects).toEqual([
      { url: 'ws://lk.test', token: 'token-1', options: { autoSubscribe: false } },
    ]);
    expect(lk.options).toMatchObject({
      adaptiveStream: true,
      dynacast: true,
      publishDefaults: { simulcast: true },
    });
    expect(lk.localParticipant.calls).toEqual(['mic:true', 'camera:true']);
    expect(store.getState()).toMatchObject({
      connection: 'connected',
      micOn: true,
      cameraOn: true,
    });
    // Nobody is subscribed before media:peers.
    lk.addParticipant('user-2');
    lk.emit(RoomEvent.ParticipantConnected);
    expect(store.getState().subscribed).toEqual([]);
  });

  it('uses the devices chosen in the pre-join and publishes only what is enabled', async () => {
    const lk = await started({
      ...DEFAULT_MEDIA_CHOICES,
      videoEnabled: false,
      audioDeviceId: 'mic-2',
      videoDeviceId: 'cam-3',
      audioOutputDeviceId: 'spk-1',
    });

    expect(lk.options.audioCaptureDefaults).toMatchObject({ deviceId: 'mic-2' });
    expect(lk.options.videoCaptureDefaults).toMatchObject({ deviceId: 'cam-3' });
    expect(lk.options.audioOutput).toEqual({ deviceId: 'spk-1' });
    expect(lk.localParticipant.calls).toEqual(['mic:true', 'camera:false']);
    expect(store.getState()).toMatchObject({ micOn: true, cameraOn: false });
  });

  it('keeps going without the device the browser refuses, and says why', async () => {
    controller.start('space-1', DEFAULT_MEDIA_CHOICES);
    room().localParticipant.cameraError = Object.assign(new Error('no'), {
      name: 'NotAllowedError',
    });
    await settle();

    expect(store.getState()).toMatchObject({
      connection: 'connected',
      micOn: true,
      cameraOn: false,
      deviceProblem: 'denied',
    });
  });

  it('toggles the microphone and camera (the others see the mute)', async () => {
    const lk = await started();

    await controller.toggleMic();
    await controller.setCameraEnabled(false);
    expect(lk.localParticipant.calls.slice(2)).toEqual(['mic:false', 'camera:false']);
    expect(store.getState()).toMatchObject({ micOn: false, cameraOn: false });

    await controller.toggleMic();
    expect(store.getState().micOn).toBe(true);
  });
});

describe('MediaController: subscriptions follow media:peers (E5-S5)', () => {
  it('subscribes exactly to the peers and unsubscribes at once when they leave the list', async () => {
    const lk = await started();
    const luis = lk.addParticipant('user-2', 'Luis');
    const eva = lk.addParticipant('user-3', 'Eva');
    lk.emit(RoomEvent.ParticipantConnected);

    realtime.peers('user-2');
    expect(luis.subscribed).toBe(true);
    expect(eva.subscribed).toBe(false);
    expect(store.getState()).toMatchObject({ peers: ['user-2'], subscribed: ['user-2'] });
    expect(Object.keys(store.getState().participants)).toEqual(['user-2']);
    expect(store.getState().participants['user-2']).toMatchObject({
      name: 'Luis',
      micOn: true,
      cameraOn: true,
    });

    // Synchronously on the event: well under the 300 ms of the story.
    realtime.peers('user-3');
    expect(luis.subscribed).toBe(false);
    expect(luis.camera.setSubscribedCalls).toEqual([true, false]);
    expect(eva.subscribed).toBe(true);
    expect(store.getState().subscribed).toEqual(['user-3']);

    realtime.peers();
    expect(store.getState()).toMatchObject({ peers: [], subscribed: [], participants: {} });
  });

  it('subscribes to peers who connect or publish after the media:peers', async () => {
    const lk = await started();
    realtime.peers('user-2');

    const luis = lk.addParticipant('user-2');
    lk.emit(RoomEvent.TrackPublished);

    expect(luis.subscribed).toBe(true);
  });

  it('keeps media:peers received before the media server connects', async () => {
    controller.start('space-1', DEFAULT_MEDIA_CHOICES);
    realtime.peers('user-2');
    room().addParticipant('user-2');
    await settle();

    expect(room().remoteParticipants.get('user-2')?.subscribed).toBe(true);
  });

  it('plays the audio of subscribed peers and removes it when they leave', async () => {
    const lk = await started();
    const luis = lk.addParticipant('user-2');
    realtime.peers('user-2');
    const audio = new FakeAudioTrack('a1');

    lk.emit(RoomEvent.TrackSubscribed, audio, luis.mic, luis);
    expect(document.querySelectorAll('audio[data-bululu-audio="user-2"]')).toHaveLength(1);

    lk.emit(RoomEvent.TrackUnsubscribed, audio, luis.mic, luis);
    expect(document.querySelectorAll('audio')).toHaveLength(0);
  });

  it('attaches the video of a peer and enlarges one on the high simulcast layer', async () => {
    const lk = await started();
    const luis = lk.addParticipant('user-2');
    const eva = lk.addParticipant('user-3');
    realtime.peers('user-2', 'user-3');
    const video = document.createElement('video');

    const detach = controller.attachVideo('user-2', video);
    expect(luis.camera.videoTrack?.attached.has(video)).toBe(true);
    detach();
    expect(luis.camera.videoTrack?.attached.size).toBe(0);

    controller.focus('user-2');
    expect(store.getState().focused).toBe('user-2');
    expect(luis.camera.quality).toBe(VideoQuality.HIGH);
    expect(eva.camera.quality).toBe(VideoQuality.LOW);
    controller.focus(null);
    expect(eva.camera.quality).toBe(VideoQuality.HIGH);
  });

  it('drops the enlarged video when that person is no longer a peer', async () => {
    const lk = await started();
    lk.addParticipant('user-2');
    const eva = lk.addParticipant('user-3');
    realtime.peers('user-2', 'user-3');
    controller.focus('user-2');
    expect(eva.camera.quality).toBe(VideoQuality.LOW);

    realtime.peers('user-3');

    expect(store.getState().focused).toBeNull();
    expect(eva.camera.quality).toBe(VideoQuality.HIGH);
  });

  it('records the time from media:peers to the first frame of each new peer', async () => {
    const lk = await started();
    lk.addParticipant('user-2');
    realtime.peers('user-2');
    clock += 420;

    controller.firstFrame('user-2');
    controller.firstFrame('user-2'); // later frames do not count

    expect(timings).toEqual([[FIRST_FRAME_TIMING, 420]]);
    expect(store.getState().firstFrameMs).toEqual([420]);

    // A peer who leaves before any frame is not measured.
    realtime.peers('user-2', 'user-3');
    realtime.peers('user-2');
    controller.firstFrame('user-3');
    expect(timings).toHaveLength(1);
  });
});

describe('MediaController: reconnection and tokens', () => {
  it('re-applies the last peers after LiveKit resumes a short cut', async () => {
    const lk = await started();
    const luis = lk.addParticipant('user-2');
    realtime.peers('user-2');

    lk.emit(RoomEvent.Reconnecting);
    expect(store.getState().connection).toBe('reconnecting');
    // During the cut LiveKit lost the subscription state.
    luis.camera.isDesired = false;
    lk.emit(RoomEvent.Reconnected);

    expect(store.getState().connection).toBe('connected');
    expect(luis.camera.isDesired).toBe(true);
  });

  it('reconnects with a fresh token after a full disconnection, with backoff', async () => {
    const lk = await started();
    lk.addParticipant('user-2');
    realtime.peers('user-2');

    lk.emit(RoomEvent.Disconnected, DisconnectReason.SIGNAL_CLOSE);
    expect(store.getState().connection).toBe('reconnecting');
    await vi.advanceTimersByTimeAsync(RECONNECT_DELAYS_MS[0] - 1);
    expect(lk.connects).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    await settle();

    expect(lk.connects.map((connect) => connect.token)).toEqual(['token-1', 'token-2']);
    expect(store.getState().connection).toBe('connected');
    expect(lk.remoteParticipants.get('user-2')?.subscribed).toBe(true);
  });

  it('does not reconnect when removed from the room', async () => {
    const lk = await started();

    lk.emit(RoomEvent.Disconnected, DisconnectReason.PARTICIPANT_REMOVED);
    await vi.advanceTimersByTimeAsync(60_000);

    expect(store.getState().connection).toBe('disconnected');
    expect(lk.connects).toHaveLength(1);
  });

  it('takes the media back after DUPLICATE_IDENTITY while this tab still holds the avatar', async () => {
    // A stale tab that came back online reconnected to LiveKit on its own and bumped this one.
    const lk = await started();

    lk.emit(RoomEvent.Disconnected, DisconnectReason.DUPLICATE_IDENTITY);
    await vi.advanceTimersByTimeAsync(RECONNECT_DELAYS_MS[0]);
    await settle();

    expect(lk.connects).toHaveLength(2);
    expect(store.getState().connection).toBe('connected');
  });

  it('reconnects fully only once this tab holds the avatar again (never from a replaced tab)', async () => {
    let joined = true;
    controller.stop();
    controller = new MediaController({
      realtime: realtime.asRealtime(),
      events,
      store,
      fetchToken,
      createRoom: (options) => {
        const created = new FakeRoom(options);
        rooms.push(created);
        return created.asRoom();
      },
      now: () => clock,
      realtimeJoined: () => joined,
    });
    const lk = await started();

    // Offline: LiveKit gives up, and so does the realtime connection.
    joined = false;
    lk.emit(RoomEvent.Disconnected, DisconnectReason.SIGNAL_CLOSE);
    realtime.reconnect();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(lk.connects).toHaveLength(1);

    // The realtime join succeeds: this tab still holds the avatar.
    joined = true;
    events.emit('world:snapshot', {} as SpaceSnapshot);
    await settle();

    expect(lk.connects).toHaveLength(2);
    expect(store.getState().connection).toBe('connected');
  });

  it('reconnects at once when the realtime connection comes back, even after a failed attempt', async () => {
    const lk = await started();
    lk.emit(RoomEvent.Disconnected, DisconnectReason.SIGNAL_CLOSE);
    // Still offline at the first backoff attempt: the token request fails.
    fetchToken.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    await vi.advanceTimersByTimeAsync(RECONNECT_DELAYS_MS[0]);
    await settle();
    expect(lk.connects).toHaveLength(1);

    realtime.reconnect();
    await settle();

    expect(lk.connects).toHaveLength(2);
    expect(store.getState().connection).toBe('connected');
  });

  it('refreshes the 10 min token before it expires', async () => {
    await started();
    const refreshAt = (MEDIA_TOKEN_TTL_SECONDS - MEDIA_TOKEN_REFRESH_MARGIN_SECONDS) * 1000;

    await vi.advanceTimersByTimeAsync(refreshAt - 1);
    expect(fetchToken).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(fetchToken).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(refreshAt);
    expect(fetchToken).toHaveBeenCalledTimes(3);
  });

  it('refreshes the token when the realtime connection comes back', async () => {
    await started();

    // The first realtime connection of the visit does not ask for another token.
    realtime.reconnect();
    await settle();
    expect(fetchToken).toHaveBeenCalledTimes(1);

    clock += TOKEN_FRESH_MS;
    realtime.reconnect();
    await settle();
    expect(fetchToken).toHaveBeenCalledTimes(2);
  });

  it('ends the media when the server says the person is no longer a member', async () => {
    const lk = await started();
    fetchToken.mockRejectedValueOnce(new ApiError(404, 'NOT_A_MEMBER', 'gone'));
    clock += TOKEN_FRESH_MS;

    realtime.reconnect();
    await settle();

    expect(lk.disconnects).toBe(1);
    expect(store.getState()).toMatchObject({ connection: 'disconnected', micOn: false });
    await vi.advanceTimersByTimeAsync(MEDIA_TOKEN_TTL_SECONDS * 1000);
    expect(fetchToken).toHaveBeenCalledTimes(2);
  });

  it('retries the connection when the token or the media server fails', async () => {
    fetchToken.mockRejectedValueOnce(new ApiError(0, 'NETWORK_ERROR', 'offline'));
    controller.start('space-1', DEFAULT_MEDIA_CHOICES);
    await settle();
    expect(store.getState().connection).toBe('reconnecting');

    await vi.advanceTimersByTimeAsync(RECONNECT_DELAYS_MS[0]);
    await settle();
    expect(store.getState().connection).toBe('connected');
  });
});

describe('MediaController: away and leaving', () => {
  it('mutes the microphone and camera while away and restores what was on', async () => {
    const lk = await started({ ...DEFAULT_MEDIA_CHOICES, videoEnabled: false });

    events.emit('presence:self-hidden', { hidden: true });
    await settle();
    expect(store.getState()).toMatchObject({ micOn: false, cameraOn: false, awayMuted: true });

    events.emit('presence:self-hidden', { hidden: true }); // repeated: still remembers "mic on"
    events.emit('presence:self-hidden', { hidden: false });
    await settle();
    expect(store.getState()).toMatchObject({ micOn: true, cameraOn: false, awayMuted: false });
    expect(lk.localParticipant.calls.at(-2)).toBe('mic:true');
  });

  it('does not touch the media when the person is only idle (away without a hidden tab)', async () => {
    // Ten minutes talking face to face in the hallway without mouse or keyboard (RN-05).
    await started();

    events.emit('presence:self-away', { away: true });
    await settle();

    expect(store.getState()).toMatchObject({ micOn: true, cameraOn: true, awayMuted: false });
  });

  it('a manual toggle while away wins over the restore', async () => {
    await started();
    events.emit('presence:self-hidden', { hidden: true });
    await settle();

    await controller.setMicEnabled(true);
    events.emit('presence:self-hidden', { hidden: false });
    await settle();

    expect(store.getState()).toMatchObject({ micOn: true, cameraOn: false, awayMuted: false });
  });

  it('turns microphone and camera off inside a meeting room and restores exactly what was on (E6-S2)', async () => {
    const lk = await started({ ...DEFAULT_MEDIA_CHOICES, videoEnabled: false });

    events.emit('media:self-in-room', { inRoom: true });
    await settle();
    expect(store.getState()).toMatchObject({ micOn: false, cameraOn: false, roomMuted: true });
    expect(lk.localParticipant.calls.slice(-2)).toEqual(['mic:false', 'camera:false']);

    // The bottom bar and the shortcuts do nothing inside the room.
    await controller.toggleMic();
    await controller.setCameraEnabled(true);
    expect(store.getState()).toMatchObject({ micOn: false, cameraOn: false });

    events.emit('media:self-in-room', { inRoom: false });
    await settle();
    // Back once the person has stayed out a moment (not at every step along the border).
    expect(store.getState()).toMatchObject({ micOn: false, cameraOn: false, roomMuted: false });
    await vi.advanceTimersByTimeAsync(ROOM_EXIT_SETTLE_MS);
    expect(store.getState()).toMatchObject({ micOn: true, cameraOn: false, roomMuted: false });
    expect(lk.localParticipant.calls.slice(-2)).toEqual(['mic:true', 'camera:false']);
  });

  it('restores only when the person is neither away nor in a room, in either order', async () => {
    await started();

    events.emit('media:self-in-room', { inRoom: true });
    events.emit('presence:self-hidden', { hidden: true });
    events.emit('media:self-in-room', { inRoom: false });
    await settle();
    expect(store.getState()).toMatchObject({ micOn: false, cameraOn: false, awayMuted: true });
    events.emit('presence:self-hidden', { hidden: false });
    await vi.advanceTimersByTimeAsync(ROOM_EXIT_SETTLE_MS);
    expect(store.getState()).toMatchObject({ micOn: true, cameraOn: true, awayMuted: false });

    events.emit('presence:self-hidden', { hidden: true });
    events.emit('media:self-in-room', { inRoom: true });
    events.emit('presence:self-hidden', { hidden: false });
    await settle();
    expect(store.getState()).toMatchObject({ micOn: false, cameraOn: false, roomMuted: true });
    // A manual toggle neither turns anything on inside the room nor forgets what to restore.
    await controller.toggleCamera();
    events.emit('media:self-in-room', { inRoom: false });
    await vi.advanceTimersByTimeAsync(ROOM_EXIT_SETTLE_MS);
    expect(store.getState()).toMatchObject({ micOn: true, cameraOn: true, roomMuted: false });
    expect(controller.holds).toEqual({ away: false, room: false });
  });

  it('waits until LiveKit lets the person publish again before restoring (E6-S3)', async () => {
    const lk = await started();
    events.emit('media:self-in-room', { inRoom: true });
    await settle();
    // Inside the room the server revoked the permission to publish.
    lk.localParticipant.permissions = { canPublish: false };
    lk.emit(RoomEvent.ParticipantPermissionsChanged, undefined, lk.localParticipant);
    const before = lk.localParticipant.calls.length;

    events.emit('media:self-in-room', { inRoom: false });
    await vi.advanceTimersByTimeAsync(ROOM_EXIT_SETTLE_MS);
    expect(lk.localParticipant.calls.slice(before)).toEqual([]);
    expect(store.getState()).toMatchObject({ micOn: false, cameraOn: false, roomMuted: false });

    // Someone else's permissions do not matter.
    lk.localParticipant.permissions = { canPublish: true };
    lk.emit(RoomEvent.ParticipantPermissionsChanged, undefined, lk.addParticipant('user-2'));
    await settle();
    expect(lk.localParticipant.calls.slice(before)).toEqual([]);

    lk.emit(RoomEvent.ParticipantPermissionsChanged, undefined, lk.localParticipant);
    await settle();
    expect(lk.localParticipant.calls.slice(before)).toEqual(['mic:true', 'camera:true']);
    expect(store.getState()).toMatchObject({ micOn: true, cameraOn: true });
  });

  it('keeps the camera wanted when LiveKit refuses it during a quick walk out and back in (E6-S3)', async () => {
    const lk = await started();
    events.emit('media:self-in-room', { inRoom: true });
    await settle();
    // Out again before the revoke of the entry reached this client: the camera is turned on,
    // and LiveKit refuses it because the revoke arrives while the camera opens.
    lk.localParticipant.cameraError = Object.assign(new Error('insufficient permissions'), {
      name: 'PublishTrackError',
    });
    lk.localParticipant.micError = lk.localParticipant.cameraError;
    events.emit('media:self-in-room', { inRoom: false });
    await vi.advanceTimersByTimeAsync(ROOM_EXIT_SETTLE_MS);
    expect(store.getState()).toMatchObject({ micOn: false, cameraOn: false, deviceProblem: null });

    // Back in the hallway for good: LiveKit grants publishing and both come back.
    lk.localParticipant.cameraError = null;
    lk.localParticipant.micError = null;
    lk.localParticipant.permissions = { canPublish: true };
    lk.emit(RoomEvent.ParticipantPermissionsChanged, undefined, lk.localParticipant);
    await settle();
    expect(store.getState()).toMatchObject({ micOn: true, cameraOn: true, deviceProblem: null });
  });

  it('never overlaps two changes of the same device, and ends with what is wanted (E6-S3)', async () => {
    const lk = await started();
    const local = lk.localParticipant;
    const original = local.setCameraEnabled.bind(local);
    let inFlight = 0;
    let maxInFlight = 0;
    local.setCameraEnabled = async (enabled: boolean) => {
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 50)); // opening the camera takes time
      await original(enabled);
      inFlight--;
    };

    // In and out of a room four times, faster than the camera opens.
    for (const inRoom of [true, false, true, false, true, false, true, false]) {
      events.emit('media:self-in-room', { inRoom });
    }
    await vi.advanceTimersByTimeAsync(1000);

    expect(maxInFlight).toBe(1);
    expect(store.getState()).toMatchObject({ micOn: true, cameraOn: true, roomMuted: false });
    expect(local.calls.at(-1)).toBe('camera:true');
  });

  it('publishes the camera again when the revoke of a quick step back in cut its publication (E6-S3)', async () => {
    const lk = await started({ ...DEFAULT_MEDIA_CHOICES, audioEnabled: false });
    const local = lk.localParticipant;
    events.emit('media:self-in-room', { inRoom: true });
    await settle();
    events.emit('media:self-in-room', { inRoom: false });
    // The revoke of the next step into the room arrived while the camera was being published:
    // LiveKit never answers, and after its 10 s the SDK fails with a connection error. Out of the
    // room for good by then: it is not a device problem, the camera is still wanted.
    local.cameraError = Object.assign(
      new Error('publication of local track timed out, no response from server'),
      { name: 'ConnectionError' },
    );
    await vi.advanceTimersByTimeAsync(ROOM_EXIT_SETTLE_MS);
    expect(local.calls.at(-1)).toBe('camera:true');
    expect(store.getState()).toMatchObject({ cameraOn: false, deviceProblem: null });

    local.cameraError = null;
    await vi.advanceTimersByTimeAsync(PUBLISH_RETRY_MS);
    expect(store.getState()).toMatchObject({ micOn: false, cameraOn: true, deviceProblem: null });
  });

  it('gives up on a device LiveKit keeps failing to publish, and says so', async () => {
    const lk = await started({ ...DEFAULT_MEDIA_CHOICES, audioEnabled: false });
    const local = lk.localParticipant;
    await controller.setCameraEnabled(false);
    local.cameraError = Object.assign(new Error('negotiation failed'), {
      name: 'NegotiationError',
    });
    const before = local.calls.length;

    await controller.setCameraEnabled(true);
    await vi.advanceTimersByTimeAsync(PUBLISH_RETRY_MS * PUBLISH_ATTEMPTS * 2);

    expect(local.calls.slice(before)).toEqual(Array(PUBLISH_ATTEMPTS).fill('camera:true'));
    expect(store.getState()).toMatchObject({ cameraOn: false, deviceProblem: 'unavailable' });
  });

  it('does not turn devices on at each step along the border of a room, only once out (E6-S3)', async () => {
    const lk = await started();
    const local = lk.localParticipant;
    events.emit('media:self-in-room', { inRoom: true });
    await settle();
    const before = local.calls.length;

    // Out and in again every 150 ms (a step takes 120 ms): nothing is published meanwhile.
    for (let i = 0; i < 3; i++) {
      events.emit('media:self-in-room', { inRoom: false });
      await vi.advanceTimersByTimeAsync(150);
      events.emit('media:self-in-room', { inRoom: true });
      await vi.advanceTimersByTimeAsync(150);
    }
    expect(local.calls.slice(before).filter((call) => call.endsWith(':true'))).toEqual([]);

    events.emit('media:self-in-room', { inRoom: false });
    await vi.advanceTimersByTimeAsync(ROOM_EXIT_SETTLE_MS);
    expect(local.calls.slice(-2)).toEqual(['mic:true', 'camera:true']);
    expect(store.getState()).toMatchObject({ micOn: true, cameraOn: true, roomMuted: false });
  });

  it('releases everything on stop and ignores late events', async () => {
    const lk = await started();
    const luis = lk.addParticipant('user-2');
    realtime.peers('user-2');
    lk.emit(RoomEvent.TrackSubscribed, new FakeAudioTrack('a1'), luis.mic, luis);

    controller.stop();

    expect(lk.disconnects).toBe(1);
    expect(lk.listenerCount(RoomEvent.Disconnected)).toBe(0);
    expect(document.querySelectorAll('audio')).toHaveLength(0);
    expect(realtime.peersListeners.size).toBe(0);
    expect(events.listenerCount()).toBe(0);
    expect(store.getState()).toMatchObject({ connection: 'idle', peers: [], subscribed: [] });
    await vi.advanceTimersByTimeAsync(MEDIA_TOKEN_TTL_SECONDS * 1000);
    expect(fetchToken).toHaveBeenCalledTimes(1);
  });

  it('drops a connection that finishes after stop (StrictMode double mount)', async () => {
    controller.start('space-1', DEFAULT_MEDIA_CHOICES);
    const first = room();
    controller.stop();
    controller.start('space-1', DEFAULT_MEDIA_CHOICES);
    await settle();

    expect(first.connects).toHaveLength(0);
    expect(room()).not.toBe(first);
    expect(room().connects).toHaveLength(1);
    expect(store.getState().connection).toBe('connected');
  });
});
