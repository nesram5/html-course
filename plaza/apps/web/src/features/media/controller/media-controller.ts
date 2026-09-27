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

/** Disconnections after which reconnecting makes no sense. */
const FINAL_DISCONNECTS: ReadonlySet<DisconnectReason> = new Set([
  DisconnectReason.CLIENT_INITIATED,
  // Removed from the space (kick) or the same person joined from another tab.
  DisconnectReason.PARTICIPANT_REMOVED,
  DisconnectReason.DUPLICATE_IDENTITY,
  DisconnectReason.ROOM_DELETED,
]);

export interface MediaControllerDeps {
  /** Source of `media:peers` and of realtime reconnections (the world `RealtimeClient`). */
  readonly realtime: Pick<RealtimeClient, 'on' | 'onConnect'>;
  /** Source of `presence:self-away` (the world `EventBus`). */
  readonly events: Pick<EventBus, 'on'>;
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
 * - `presence:self-away` mutes the microphone and camera and restores them on return.
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
  /** Wanted state of the local devices (what the person chose). */
  #wantMic = false;
  #wantCamera = false;
  /** What was on before going away (E7), restored on return. */
  #awayRestore: { mic: boolean; camera: boolean } | null = null;

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
      events.on('presence:self-away', ({ away }) => {
        this.#setAway(away);
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
    this.#awayRestore = null;
    this.#reconnectAttempt = 0;
    this.#reconnecting = false;
    this.#deps.store.getState().reset();
  }

  // ── Local devices ────────────────────────────────────────────────────────

  /** Microphone on/off (bottom bar, shortcut). Others see the mute state. */
  async setMicEnabled(enabled: boolean): Promise<void> {
    this.#cancelAwayRestore();
    this.#wantMic = enabled;
    await this.#applyMic();
  }

  async setCameraEnabled(enabled: boolean): Promise<void> {
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

  /** The realtime socket (re)connected: fresh token, and reconnect now if media is down. */
  #onRealtimeReconnect(run: number): void {
    if (run !== this.#run || this.#token === null) return;
    // The first connection of the visit races with the first token: no need for another one.
    if (!this.#reconnecting && this.#now() - this.#tokenAt < TOKEN_FRESH_MS) return;
    void this.#refreshToken(run).then(() => {
      if (run !== this.#run || !this.#reconnecting) return;
      if (this.#reconnectTimer !== null) clearTimeout(this.#reconnectTimer);
      this.#reconnectTimer = null;
      void this.#connect(run);
    });
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
      void this.#connect(run);
    }, delay);
  }

  #isRemoval(error: unknown): boolean {
    return isApiError(error) && (error.code === 'NOT_A_MEMBER' || error.code === 'NOT_FOUND');
  }

  /** Media over for good (removed from the space): release everything, keep the state. */
  #end(): void {
    this.#run++;
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
    this.#deps.store.getState().patch({ peers: [...next].sort() });
    this.#applySubscriptions();
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

  async #applyMic(): Promise<void> {
    const room = this.#room;
    if (room?.state !== ConnectionState.Connected) {
      this.#sync();
      return;
    }
    try {
      await room.localParticipant.setMicrophoneEnabled(this.#wantMic);
    } catch (error) {
      this.#wantMic = false;
      this.#deps.store.getState().patch({ deviceProblem: problemOf(error) });
    }
    this.#sync();
  }

  async #applyCamera(): Promise<void> {
    const room = this.#room;
    if (room?.state !== ConnectionState.Connected) {
      this.#sync();
      return;
    }
    try {
      await room.localParticipant.setCameraEnabled(this.#wantCamera);
    } catch (error) {
      this.#wantCamera = false;
      this.#deps.store.getState().patch({ deviceProblem: problemOf(error) });
    }
    this.#sync();
  }

  // ── Internals: away (E7) ─────────────────────────────────────────────────

  #setAway(away: boolean): void {
    if (away) {
      if (this.#awayRestore !== null) return;
      this.#awayRestore = { mic: this.#wantMic, camera: this.#wantCamera };
      this.#wantMic = false;
      this.#wantCamera = false;
    } else {
      const restore = this.#awayRestore;
      if (restore === null) return;
      this.#awayRestore = null;
      this.#wantMic = restore.mic;
      this.#wantCamera = restore.camera;
    }
    this.#deps.store.getState().patch({ awayMuted: away });
    void this.#applyMic();
    void this.#applyCamera();
  }

  /** A manual toggle while away wins over the automatic restore. */
  #cancelAwayRestore(): void {
    if (this.#awayRestore === null) return;
    this.#awayRestore = null;
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
