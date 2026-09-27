import { MEDIA_TOKEN_REFRESH_MARGIN_SECONDS, type MediaTokenResponse } from '@plaza/shared';
import {
  ConnectionState,
  DisconnectReason,
  Room,
  RoomEvent,
  Track,
  VideoPresets,
  VideoQuality,
  type Participant,
  type RemoteParticipant,
  type RemoteTrack,
  type RoomOptions,
} from 'livekit-client';

import type { EventBus, RealtimeClient } from '@/features/world';
import { isApiError } from '@/shared/api';
import { reportError, reportTiming } from '@/shared/lib/sentry';

import type { MediaChoices } from '../lib/media-prefs';
import type { DeviceProblem, MediaStore, RemoteMedia } from '../store/media-store';

/** Delays between full reconnection attempts after LiveKit gave up resuming (ms). */
export const RECONNECT_DELAYS_MS = [1000, 2000, 5000, 10_000, 30_000] as const;
/** Retry delay of a failed token refresh (network error) in ms. */
export const TOKEN_RETRY_MS = 30_000;
/** A token younger than this is not replaced on a realtime (re)connection (ms). */
export const TOKEN_FRESH_MS = 60_000;
/** Name of the timing sent to Sentry (E5-S5, p95 < 1.5 s). */
export const FIRST_FRAME_TIMING = 'media.peers_to_first_frame';
/**
 * After walking out of a meeting room, the microphone and camera come back only once the person
 * has stayed out this long (ms). Walking along the border would otherwise start publications
 * that the revoke of the next step into the room cuts short: LiveKit never answers them and the
 * SDK waits 10 s before failing, holding every later change of that device meanwhile (E6-S3).
 */
export const ROOM_EXIT_SETTLE_MS = 400;
/** Delay before publishing a device again after LiveKit failed to publish it (ms). */
export const PUBLISH_RETRY_MS = 1000;
/** Publish failures in a row of one device before giving up on it and saying so. */
export const PUBLISH_ATTEMPTS = 3;

/**
 * Disconnections after which reconnecting makes no sense. `DUPLICATE_IDENTITY` (the same person
 * connected from elsewhere) is not one of them: it may come from a stale tab that came back
 * online and reconnected on its own. Every full reconnection waits until this tab holds the
 * avatar in the space again (`realtimeJoined`), so the tab the person is using takes its media
 * back, while a replaced tab never does (its office closes with `SESSION_REPLACED`).
 */
const FINAL_DISCONNECTS: ReadonlySet<DisconnectReason> = new Set([
  DisconnectReason.CLIENT_INITIATED,
  // Removed from the space (kick).
  DisconnectReason.PARTICIPANT_REMOVED,
  DisconnectReason.ROOM_DELETED,
]);

export interface MediaControllerDeps {
  /** Source of `media:peers` and of realtime reconnections (the world `RealtimeClient`). */
  readonly realtime: Pick<RealtimeClient, 'on' | 'onConnect'>;
  /**
   * Source of `presence:self-hidden`, `media:self-in-room` and `world:snapshot` (a realtime join
   * of this tab) (the world `EventBus`).
   */
  readonly events: Pick<EventBus, 'on'>;
  /**
   * `true` while this tab holds the person's avatar in the space (realtime connected and
   * joined). Full reconnections to LiveKit wait for it; always `true` by default.
   */
  readonly realtimeJoined?: () => boolean;
  readonly store: MediaStore;
  readonly fetchToken: (spaceId: string) => Promise<MediaTokenResponse>;
  /** Builds the LiveKit room (tests pass a fake). */
  readonly createRoom?: (options: RoomOptions) => Room;
  readonly now?: () => number;
  /** Timing metric hook; Sentry by default. */
  readonly reportTiming?: (name: string, durationMs: number) => void;
  /** Where the `<audio>` elements of the peers go; `document.body` by default. */
  readonly audioContainer?: () => HTMLElement;
}

/** The room options of the hallway (architecture §10.2). */
export function hallwayRoomOptions(choices: MediaChoices): RoomOptions {
  return {
    // Receive only the layer each <video> needs, and stop sending layers nobody watches.
    adaptiveStream: true,
    dynacast: true,
    publishDefaults: {
      simulcast: true,
      videoSimulcastLayers: [VideoPresets.h180, VideoPresets.h360],
    },
    videoCaptureDefaults: {
      resolution: VideoPresets.h540.resolution,
      ...(choices.videoDeviceId !== null && { deviceId: choices.videoDeviceId }),
    },
    audioCaptureDefaults: {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
      ...(choices.audioDeviceId !== null && { deviceId: choices.audioDeviceId }),
    },
    ...(choices.audioOutputDeviceId !== null && {
      audioOutput: { deviceId: choices.audioOutputDeviceId },
    }),
  };
}

function problemOf(error: unknown): DeviceProblem {
  return error instanceof Error && error.name === 'NotAllowedError' ? 'denied' : 'unavailable';
}

/** Errors of the browser opening a device (`getUserMedia`) and of LiveKit refusing the device. */
const DEVICE_ERRORS: ReadonlySet<string> = new Set([
  'NotAllowedError',
  'NotFoundError',
  'NotReadableError',
  'OverconstrainedError',
  'AbortError',
  'SecurityError',
  'DeviceUnsupportedError',
]);

/**
 * `true` when the device itself failed. Anything else went wrong while LiveKit published it: a
 * refusal because the permission to publish was revoked meanwhile, or a publication that the
 * revoke of a quick step back into a meeting room cut short, which LiveKit never answers
 * ("publication of local track timed out", E6-S3). Not a device problem: what the person wants
 * is kept and published again.
 */
function isDeviceError(error: unknown): boolean {
  return error instanceof Error && DEVICE_ERRORS.has(error.name);
}

type Device = 'mic' | 'camera';

/** The run was stopped (or restarted) while an async step was in flight. */
class StaleRun extends Error {}

/**
 * The only place that talks to LiveKit (architecture §6, E5-S5). One instance per tab; the media
 * layer of the office starts it after the pre-join and stops it when leaving.
 *
 * - Connects to the space room with `autoSubscribe: false`, adaptive stream, dynacast and
 *   simulcast, and publishes the microphone and camera chosen in the pre-join.
 * - Subscribes exactly to the people of the last `media:peers` and unsubscribes the rest at once;
 *   people who connect or publish later are subscribed when they are peers.
 * - Media tokens last 10 min: a new one is fetched before it expires and after every realtime
 *   reconnection; a `NOT_A_MEMBER` answer (removed from the space) ends the media.
 * - LiveKit resumes short cuts by itself; after a full disconnection it reconnects with a fresh
 *   token and backoff. Either way the last `media:peers` is applied again.
 * - `presence:self-hidden` (hidden tab) and `media:self-in-room` turn the microphone and camera
 *   off and, once the tab is visible and the person is not in a meeting room, restore exactly
 *   what was on. Being idle for 10 min only changes the status (RN-05), never the media. Inside a room
 *   the server revokes the permission to publish (E6-S3): the restore waits until LiveKit grants
 *   it back and the person has stayed out of the room for {@link ROOM_EXIT_SETTLE_MS}; a
 *   publication LiveKit fails is published again, never taken for a device problem.
 * - Records the time from `media:peers` to the first video frame of a new peer.
 * - `stop()` disconnects and releases every track and element.
 */
export class MediaController {
  readonly #deps: MediaControllerDeps;
  readonly #now: () => number;
  /** Bumped by `start` and `stop`: async work of older runs is dropped. */
  #run = 0;
  #spaceId: string | null = null;
  #room: Room | null = null;
  #token: MediaTokenResponse | null = null;
  /** When `#token` was received (`now()`). */
  #tokenAt = 0;
  #peers = new Set<string>();
  /** userId → when it became a peer, until its first video frame. */
  readonly #pendingFrames = new Map<string, number>();
  readonly #audioElements = new Map<RemoteTrack, HTMLMediaElement[]>();
  #cleanups: (() => void)[] = [];
  #refreshTimer: ReturnType<typeof setTimeout> | null = null;
  #reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  #reconnectAttempt = 0;
  #reconnecting = false;
  /** A full reconnection is waiting for this tab to join the space again (`world:snapshot`). */
  #connectOnJoin = false;
  /** Wanted state of the local devices (what the person chose). */
  #wantMic = false;
  #wantCamera = false;
  /** Why the devices are held off: hidden tab (E7) and / or in a meeting room (E6-S2). */
  #holds = { away: false, room: false };
  /** What was on before the first hold, restored when every hold is gone. */
  #restore: { mic: boolean; camera: boolean } | null = null;
  /** Tails of the per-device queues of {@link #applyMic} / {@link #applyCamera} (never reject). */
  #micChanges: Promise<void> = Promise.resolve();
  #cameraChanges: Promise<void> = Promise.resolve();
  /** Running while the person has just walked out of a meeting room ({@link ROOM_EXIT_SETTLE_MS}). */
  #settleTimer: ReturnType<typeof setTimeout> | null = null;
  /** Publish failures in a row of each device, and the timers that try again. */
  #publishFailures: Record<Device, number> = { mic: 0, camera: 0 };
  #publishRetries: Record<Device, ReturnType<typeof setTimeout> | null> = {
    mic: null,
    camera: null,
  };

  constructor(deps: MediaControllerDeps) {
    this.#deps = deps;
    this.#now = deps.now ?? (() => performance.now());
  }

  get store(): MediaStore {
    return this.#deps.store;
  }

  /** Enters the hallway media of a space with the pre-join choices. Restarts when running. */
  start(spaceId: string, choices: MediaChoices): void {
    this.stop();
    const run = ++this.#run;
    const { realtime, events, store } = this.#deps;
    this.#spaceId = spaceId;
    this.#wantMic = choices.audioEnabled;
    this.#wantCamera = choices.videoEnabled;
    this.#cleanups = [
      realtime.on('media:peers', ({ peers }) => {
        this.#setPeers(peers);
      }),
      realtime.onConnect(() => {
        this.#onRealtimeReconnect(run);
      }),
      events.on('world:snapshot', () => {
        if (run !== this.#run || !this.#connectOnJoin) return;
        this.#connectOnJoin = false;
        void this.#connect(run);
      }),
      events.on('presence:self-hidden', ({ hidden }) => {
        this.#setHold('away', hidden);
      }),
      events.on('media:self-in-room', ({ inRoom }) => {
        this.#setHold('room', inRoom);
      }),
    ];
    store.getState().patch({ connection: 'connecting', micOn: false, cameraOn: false });
    const room = (this.#deps.createRoom ?? ((options) => new Room(options)))(
      hallwayRoomOptions(choices),
    );
    this.#room = room;
    this.#wire(room, run);
    void this.#connect(run);
  }

  /** Leaves: disconnects, stops every local track and removes every element. Idempotent. */
  stop(): void {
    this.#run++;
    for (const dispose of this.#cleanups.splice(0)) dispose();
    this.#clearTimers();
    const room = this.#room;
    this.#room = null;
    if (room !== null) {
      room.removeAllListeners();
      room.disconnect(true).catch(() => undefined);
    }
    for (const elements of this.#audioElements.values()) for (const el of elements) el.remove();
    this.#audioElements.clear();
    this.#peers = new Set();
    this.#pendingFrames.clear();
    this.#token = null;
    this.#spaceId = null;
    this.#holds = { away: false, room: false };
    this.#restore = null;
    this.#publishFailures = { mic: 0, camera: 0 };
    this.#reconnectAttempt = 0;
    this.#reconnecting = false;
    this.#connectOnJoin = false;
    this.#deps.store.getState().reset();
  }

  // ── Local devices ────────────────────────────────────────────────────────

  /**
   * Microphone on/off (bottom bar, shortcut). Others see the mute state. Ignored inside a meeting
   * room: the meeting is in Google Meet, and the server does not let anyone publish there.
   */
  async setMicEnabled(enabled: boolean): Promise<void> {
    if (this.#holds.room) return;
    this.#cancelAwayRestore();
    this.#wantMic = enabled;
    await this.#applyMic();
  }

  async setCameraEnabled(enabled: boolean): Promise<void> {
    if (this.#holds.room) return;
    this.#cancelAwayRestore();
    this.#wantCamera = enabled;
    await this.#applyCamera();
  }

  toggleMic(): Promise<void> {
    return this.setMicEnabled(!this.#wantMic);
  }

  toggleCamera(): Promise<void> {
    return this.setCameraEnabled(!this.#wantCamera);
  }

  /**
   * Plays the hallway on another speaker during the call (bottom bar). `null` is the system
   * default. Remembered in the store choices, so a reconnection keeps it.
   */
  async setAudioOutput(deviceId: string | null): Promise<void> {
    const { store } = this.#deps;
    const choices = store.getState().choices;
    if (choices !== null)
      store.getState().setChoices({ ...choices, audioOutputDeviceId: deviceId });
    const room = this.#room;
    if (room === null) return;
    try {
      await room.switchActiveDevice('audiooutput', deviceId ?? 'default');
    } catch (error) {
      reportError(error);
      store.getState().patch({ deviceProblem: 'unavailable' });
    }
  }

  /** Browsers block audio until a gesture: call from a click ("Activar sonido"). */
  async startAudio(): Promise<void> {
    await this.#room?.startAudio();
    this.#deps.store.getState().patch({ audioBlocked: this.#room?.canPlaybackAudio === false });
  }

  // ── Videos ───────────────────────────────────────────────────────────────

  /** Attaches the camera of a peer to a `<video>`; returns the function that detaches it. */
  attachVideo(userId: string, element: HTMLVideoElement): () => void {
    const track = this.#room?.remoteParticipants
      .get(userId)
      ?.getTrackPublication(Track.Source.Camera)?.videoTrack;
    if (track === undefined) return () => undefined;
    track.attach(element);
    return () => {
      track.detach(element);
    };
  }

  /** Attaches the local camera (self view). */
  attachLocalVideo(element: HTMLVideoElement): () => void {
    const track = this.#room?.localParticipant.getTrackPublication(Track.Source.Camera)?.videoTrack;
    if (track === undefined) return () => undefined;
    track.attach(element);
    return () => {
      track.detach(element);
    };
  }

  /** A `<video>` of a peer showed its first frame: closes the `media:peers` → frame timing. */
  firstFrame(userId: string): void {
    const since = this.#pendingFrames.get(userId);
    if (since === undefined) return;
    this.#pendingFrames.delete(userId);
    const ms = Math.max(0, this.#now() - since);
    this.#deps.store.getState().recordFirstFrame(ms);
    (this.#deps.reportTiming ?? reportTiming)(FIRST_FRAME_TIMING, ms);
  }

  /** Enlarges a video (high simulcast layer) or, with `null`, goes back to the strip. */
  focus(userId: string | null): void {
    this.#deps.store.getState().patch({ focused: userId });
    this.#applyVideoQuality();
  }

  // ── Internals: connection ────────────────────────────────────────────────

  async #connect(run: number): Promise<void> {
    const room = this.#room;
    if (room === null) return;
    try {
      const { url, token } = this.#token ?? (await this.#fetchToken(run));
      await room.connect(url, token, { autoSubscribe: false });
      this.#assertCurrent(run);
      this.#reconnectAttempt = 0;
      this.#reconnecting = false;
      this.#deps.store.getState().patch({
        connection: 'connected',
        audioBlocked: !room.canPlaybackAudio,
      });
      this.#applySubscriptions();
      await Promise.all([this.#applyMic(), this.#applyCamera()]);
    } catch (error) {
      if (error instanceof StaleRun || run !== this.#run) return;
      if (this.#isRemoval(error)) {
        this.#end();
        return;
      }
      reportError(error);
      this.#scheduleReconnect(run);
    }
  }

  async #fetchToken(run: number): Promise<MediaTokenResponse> {
    const spaceId = this.#spaceId;
    if (spaceId === null) throw new StaleRun();
    const token = await this.#deps.fetchToken(spaceId);
    this.#assertCurrent(run);
    this.#token = token;
    this.#tokenAt = this.#now();
    this.#scheduleRefresh(run, token.expiresInSeconds);
    return token;
  }

  /** Asks for a new token before this one expires (used by the next full reconnection). */
  #scheduleRefresh(run: number, expiresInSeconds: number): void {
    if (this.#refreshTimer !== null) clearTimeout(this.#refreshTimer);
    const seconds = Math.max(
      expiresInSeconds - MEDIA_TOKEN_REFRESH_MARGIN_SECONDS,
      expiresInSeconds / 2,
    );
    this.#refreshTimer = setTimeout(() => {
      this.#refreshTimer = null;
      void this.#refreshToken(run);
    }, seconds * 1000);
  }

  async #refreshToken(run: number): Promise<void> {
    try {
      await this.#fetchToken(run);
    } catch (error) {
      if (error instanceof StaleRun || run !== this.#run) return;
      if (this.#isRemoval(error)) {
        this.#end();
        return;
      }
      this.#refreshTimer = setTimeout(() => {
        this.#refreshTimer = null;
        void this.#refreshToken(run);
      }, TOKEN_RETRY_MS);
    }
  }

  /**
   * The realtime socket (re)connected. Media down: reconnect now (with a fresh token) instead of
   * waiting for the backoff, as soon as this tab is back in the space. Media up: fetch a fresh
   * token for the next full reconnection.
   */
  #onRealtimeReconnect(run: number): void {
    if (run !== this.#run) return;
    if (this.#reconnecting) {
      if (this.#reconnectTimer !== null) clearTimeout(this.#reconnectTimer);
      this.#reconnectTimer = null;
      this.#token = null;
      this.#connectWhenJoined(run);
      return;
    }
    // The first connection of the visit races with the first token: no need for another one.
    if (this.#token === null || this.#now() - this.#tokenAt < TOKEN_FRESH_MS) return;
    void this.#refreshToken(run);
  }

  /**
   * Full reconnection, only while this tab holds the avatar: a tab replaced while it was offline
   * must not take the media connection of the person's current tab (`DUPLICATE_IDENTITY`).
   */
  #connectWhenJoined(run: number): void {
    if (this.#deps.realtimeJoined?.() ?? true) {
      this.#connectOnJoin = false;
      void this.#connect(run);
    } else {
      this.#connectOnJoin = true;
    }
  }

  #scheduleReconnect(run: number): void {
    this.#reconnecting = true;
    this.#deps.store.getState().patch({ connection: 'reconnecting' });
    const delay =
      RECONNECT_DELAYS_MS[Math.min(this.#reconnectAttempt, RECONNECT_DELAYS_MS.length - 1)];
    this.#reconnectAttempt++;
    if (this.#reconnectTimer !== null) clearTimeout(this.#reconnectTimer);
    this.#reconnectTimer = setTimeout(() => {
      this.#reconnectTimer = null;
      if (run !== this.#run) return;
      // A token about to expire is replaced first.
      this.#token = null;
      this.#connectWhenJoined(run);
    }, delay);
  }

  #isRemoval(error: unknown): boolean {
    return isApiError(error) && (error.code === 'NOT_A_MEMBER' || error.code === 'NOT_FOUND');
  }

  /** Media over for good (removed from the space): release everything, keep the state. */
  #end(): void {
    this.#run++;
    this.#connectOnJoin = false;
    this.#clearTimers();
    const room = this.#room;
    this.#room = null;
    if (room !== null) {
      room.removeAllListeners();
      room.disconnect(true).catch(() => undefined);
    }
    this.#deps.store
      .getState()
      .patch({ connection: 'disconnected', micOn: false, cameraOn: false, subscribed: [] });
  }

  #clearTimers(): void {
    if (this.#refreshTimer !== null) clearTimeout(this.#refreshTimer);
    if (this.#reconnectTimer !== null) clearTimeout(this.#reconnectTimer);
    this.#refreshTimer = null;
    this.#reconnectTimer = null;
    this.#cancelSettle();
    for (const device of ['mic', 'camera'] as const) {
      const retry = this.#publishRetries[device];
      if (retry !== null) clearTimeout(retry);
      this.#publishRetries[device] = null;
    }
  }

  #assertCurrent(run: number): void {
    if (run !== this.#run) throw new StaleRun();
  }

  #wire(room: Room, run: number): void {
    const store = this.#deps.store;
    const sync = (): void => {
      if (run === this.#run) this.#sync();
    };
    room
      .on(RoomEvent.ParticipantConnected, () => {
        this.#applySubscriptions();
      })
      .on(RoomEvent.TrackPublished, () => {
        this.#applySubscriptions();
      })
      .on(RoomEvent.ParticipantDisconnected, sync)
      .on(RoomEvent.TrackUnpublished, sync)
      .on(RoomEvent.TrackSubscribed, (track, _publication, participant) => {
        if (track.kind === Track.Kind.Audio) this.#attachAudio(track, participant);
        this.#applyVideoQuality();
        sync();
      })
      .on(RoomEvent.TrackUnsubscribed, (track) => {
        this.#detachAudio(track);
        sync();
      })
      .on(RoomEvent.TrackMuted, sync)
      .on(RoomEvent.TrackUnmuted, sync)
      .on(RoomEvent.ActiveSpeakersChanged, sync)
      .on(RoomEvent.LocalTrackPublished, sync)
      .on(RoomEvent.LocalTrackUnpublished, sync)
      .on(RoomEvent.ParticipantPermissionsChanged, (_previous, participant) => {
        // Back from a meeting room: the server let us publish again (E6-S3).
        if (run !== this.#run || participant !== room.localParticipant) return;
        if (room.localParticipant.permissions?.canPublish === true) {
          void this.#applyMic();
          void this.#applyCamera();
        }
      })
      .on(RoomEvent.AudioPlaybackStatusChanged, () => {
        if (run === this.#run) store.getState().patch({ audioBlocked: !room.canPlaybackAudio });
      })
      .on(RoomEvent.Reconnecting, () => {
        if (run === this.#run) store.getState().patch({ connection: 'reconnecting' });
      })
      .on(RoomEvent.Reconnected, () => {
        if (run !== this.#run) return;
        store.getState().patch({ connection: 'connected' });
        // Re-apply the last hallway peers (they may have changed during the cut).
        this.#applySubscriptions();
      })
      .on(RoomEvent.Disconnected, (reason) => {
        if (run !== this.#run) return;
        for (const elements of this.#audioElements.values()) for (const el of elements) el.remove();
        this.#audioElements.clear();
        if (reason !== undefined && FINAL_DISCONNECTS.has(reason)) {
          store.getState().patch({ connection: 'disconnected', micOn: false, cameraOn: false });
          return;
        }
        this.#scheduleReconnect(run);
      });
  }

  // ── Internals: peers and subscriptions ───────────────────────────────────

  #setPeers(peers: readonly string[]): void {
    const next = new Set(peers);
    const started = this.#now();
    for (const userId of next)
      if (!this.#peers.has(userId)) this.#pendingFrames.set(userId, started);
    for (const userId of this.#pendingFrames.keys()) {
      if (!next.has(userId)) this.#pendingFrames.delete(userId);
    }
    this.#peers = next;
    const { focused } = this.#deps.store.getState();
    // An enlarged video whose person is no longer a peer has no tile to click any more: without
    // this every other video would stay capped at the low layer.
    const lostFocus = focused !== null && !next.has(focused);
    this.#deps.store.getState().patch({
      peers: [...next].sort(),
      ...(lostFocus && { focused: null }),
    });
    this.#applySubscriptions();
    if (lostFocus) this.#applyVideoQuality();
  }

  /** Subscribes to every track of the peers and to nothing else (`autoSubscribe: false`). */
  #applySubscriptions(): void {
    const room = this.#room;
    if (room === null) return;
    for (const participant of room.remoteParticipants.values()) {
      const wanted = this.#peers.has(participant.identity);
      for (const publication of participant.trackPublications.values()) {
        if (publication.isDesired !== wanted) publication.setSubscribed(wanted);
      }
    }
    this.#sync();
  }

  #applyVideoQuality(): void {
    const room = this.#room;
    if (room === null) return;
    const { focused } = this.#deps.store.getState();
    for (const participant of room.remoteParticipants.values()) {
      const publication = participant.getTrackPublication(Track.Source.Camera);
      if (publication?.isDesired !== true) continue;
      const enlarged = focused === participant.identity;
      publication.setVideoQuality(
        focused === null || enlarged ? VideoQuality.HIGH : VideoQuality.LOW,
      );
    }
  }

  #attachAudio(track: RemoteTrack, participant: RemoteParticipant): void {
    if (this.#audioElements.has(track)) return;
    const element = track.attach();
    element.dataset.plazaAudio = participant.identity;
    (this.#deps.audioContainer?.() ?? document.body).append(element);
    this.#audioElements.set(track, [element]);
  }

  #detachAudio(track: RemoteTrack): void {
    const elements = this.#audioElements.get(track);
    if (elements === undefined) return;
    this.#audioElements.delete(track);
    track.detach();
    for (const element of elements) element.remove();
  }

  /** Copies what the UI needs from the room into the store. */
  #sync(): void {
    const room = this.#room;
    if (room === null) return;
    const participants: Record<string, RemoteMedia> = {};
    const subscribed: string[] = [];
    for (const participant of room.remoteParticipants.values()) {
      const { identity } = participant;
      const desired = [...participant.trackPublications.values()].some((pub) => pub.isDesired);
      if (desired) subscribed.push(identity);
      if (!this.#peers.has(identity)) continue;
      participants[identity] = remoteMedia(participant);
    }
    const local = room.localParticipant;
    const camera = local.getTrackPublication(Track.Source.Camera);
    this.#deps.store.getState().patch({
      participants,
      subscribed: subscribed.sort(),
      micOn: local.isMicrophoneEnabled,
      cameraOn: local.isCameraEnabled,
      localVideoTrackSid: camera?.isMuted === false ? camera.trackSid : null,
      localSpeaking: local.isSpeaking,
    });
  }

  /**
   * `false` while LiveKit does not let us publish (inside a meeting room, E6-S3): turning a
   * device on then would fail, so it waits for `ParticipantPermissionsChanged`.
   */
  #canPublish(room: Room): boolean {
    return room.localParticipant.permissions?.canPublish !== false;
  }

  /**
   * Device changes run one at a time per device, each with what is wanted when it starts:
   * LiveKit mixes up overlapping `setCameraEnabled(true)` / `(false)` calls (walking in and out
   * of a meeting room quickly, E6-S3), leaving the device off when it should be on.
   */
  #applyMic(): Promise<void> {
    this.#micChanges = this.#micChanges.then(() => this.#applyMicNow()).catch(reportError);
    return this.#micChanges;
  }

  #applyCamera(): Promise<void> {
    this.#cameraChanges = this.#cameraChanges.then(() => this.#applyCameraNow()).catch(reportError);
    return this.#cameraChanges;
  }

  #applyMicNow(): Promise<void> {
    return this.#applyDevice('mic', (room, enabled) =>
      room.localParticipant.setMicrophoneEnabled(enabled),
    );
  }

  #applyCameraNow(): Promise<void> {
    return this.#applyDevice('camera', (room, enabled) =>
      room.localParticipant.setCameraEnabled(enabled),
    );
  }

  /**
   * Turns a device on or off as wanted right now. Turning it on waits while LiveKit does not let
   * the person publish and while they have just walked out of a meeting room. When LiveKit fails
   * to publish it (not the device), what is wanted is kept and published again, at once when
   * LiveKit grants publishing or after {@link PUBLISH_RETRY_MS} when it already does; after
   * {@link PUBLISH_ATTEMPTS} failures in a row it gives up and says the device is unavailable.
   */
  async #applyDevice(
    device: Device,
    setEnabled: (room: Room, enabled: boolean) => Promise<unknown>,
  ): Promise<void> {
    const room = this.#room;
    const wanted = device === 'mic' ? this.#wantMic : this.#wantCamera;
    if (
      room?.state !== ConnectionState.Connected ||
      (wanted && (!this.#canPublish(room) || this.#settleTimer !== null))
    ) {
      this.#sync(); // applied on `ParticipantPermissionsChanged` or when the settle ends
      return;
    }
    try {
      await setEnabled(room, wanted);
      this.#publishFailures[device] = 0;
    } catch (error) {
      if (isDeviceError(error)) {
        this.#giveUp(device, error);
      } else if (++this.#publishFailures[device] >= PUBLISH_ATTEMPTS) {
        reportError(error);
        this.#giveUp(device, error);
      } else if (this.#canPublish(room) && room === this.#room) {
        this.#retryPublish(device);
      } // else: retried on `ParticipantPermissionsChanged`
    }
    this.#sync();
  }

  /** The device cannot be used: it stays off until the person turns it on again. */
  #giveUp(device: Device, error: unknown): void {
    this.#publishFailures[device] = 0;
    if (device === 'mic') this.#wantMic = false;
    else this.#wantCamera = false;
    this.#deps.store.getState().patch({ deviceProblem: problemOf(error) });
  }

  #retryPublish(device: Device): void {
    if (this.#publishRetries[device] !== null) return;
    this.#publishRetries[device] = setTimeout(() => {
      this.#publishRetries[device] = null;
      void (device === 'mic' ? this.#applyMic() : this.#applyCamera());
    }, PUBLISH_RETRY_MS);
  }

  /** Walked out of a meeting room: devices come back once the person has stayed out a moment. */
  #startSettle(): void {
    this.#cancelSettle();
    this.#settleTimer = setTimeout(() => {
      this.#settleTimer = null;
      void this.#applyMic();
      void this.#applyCamera();
    }, ROOM_EXIT_SETTLE_MS);
  }

  #cancelSettle(): void {
    if (this.#settleTimer !== null) clearTimeout(this.#settleTimer);
    this.#settleTimer = null;
  }

  // ── Internals: away (E7) and meeting rooms (E6-S2) ───────────────────────

  #held(): boolean {
    return this.#holds.away || this.#holds.room;
  }

  /**
   * Away and meeting rooms both turn the devices off and may overlap: what was on is remembered
   * when the first one starts and restored only when neither is left.
   */
  #setHold(reason: 'away' | 'room', on: boolean): void {
    if (this.#holds[reason] === on) return;
    const wasHeld = this.#held();
    this.#holds = { ...this.#holds, [reason]: on };
    if (reason === 'room') {
      if (on) this.#cancelSettle();
      else this.#startSettle();
    }
    if (!wasHeld) {
      this.#restore = { mic: this.#wantMic, camera: this.#wantCamera };
      this.#wantMic = false;
      this.#wantCamera = false;
    } else if (!this.#held()) {
      const restore = this.#restore;
      this.#restore = null;
      this.#wantMic = restore?.mic ?? this.#wantMic;
      this.#wantCamera = restore?.camera ?? this.#wantCamera;
    }
    this.#deps.store.getState().patch({ awayMuted: this.#holds.away, roomMuted: this.#holds.room });
    void this.#applyMic();
    void this.#applyCamera();
  }

  /** What holds the devices off right now (tests and diagnostics). */
  get holds(): { readonly away: boolean; readonly room: boolean } {
    return this.#holds;
  }

  /** A manual toggle while away (and not in a room) wins over the automatic restore. */
  #cancelAwayRestore(): void {
    if (!this.#holds.away) return;
    this.#holds = { ...this.#holds, away: false };
    this.#restore = null;
    this.#deps.store.getState().patch({ awayMuted: false });
  }
}

function remoteMedia(participant: Participant): RemoteMedia {
  const mic = participant.getTrackPublication(Track.Source.Microphone);
  const camera = participant.getTrackPublication(Track.Source.Camera);
  const video = camera?.videoTrack;
  return {
    userId: participant.identity,
    name: participant.name ?? participant.identity,
    micOn: mic !== undefined && !mic.isMuted,
    cameraOn: camera !== undefined && !camera.isMuted,
    speaking: participant.isSpeaking,
    videoTrackSid: video !== undefined && camera?.isMuted === false ? (video.sid ?? null) : null,
  };
}
