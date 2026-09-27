import { EventEmitter } from 'node:events';

import { ConnectionState, Track, VideoQuality, type Room, type RoomOptions } from 'livekit-client';
import { expect } from 'vitest';

import { EventBus } from '@/features/world';

import { MediaController, type MediaControllerDeps } from '../controller/media-controller';
import { createMediaStore } from '../store/media-store';

/** A track publication of a remote participant, recording what the controller asks for. */
export class FakePublication {
  isDesired = false;
  isMuted = false;
  quality: VideoQuality = VideoQuality.HIGH;
  readonly setSubscribedCalls: boolean[] = [];
  videoTrack: FakeVideoTrack | undefined;

  constructor(
    readonly trackSid: string,
    readonly source: Track.Source,
  ) {
    if (source === Track.Source.Camera) this.videoTrack = new FakeVideoTrack(`${trackSid}-v`);
  }

  get kind(): Track.Kind {
    return this.source === Track.Source.Microphone ? Track.Kind.Audio : Track.Kind.Video;
  }

  setSubscribed(subscribed: boolean): void {
    this.isDesired = subscribed;
    this.setSubscribedCalls.push(subscribed);
  }

  setVideoQuality(quality: VideoQuality): void {
    this.quality = quality;
  }
}

export class FakeVideoTrack {
  readonly attached = new Set<HTMLMediaElement>();
  readonly kind = Track.Kind.Video;
  constructor(readonly sid: string) {}
  attach(element: HTMLMediaElement): HTMLMediaElement {
    this.attached.add(element);
    return element;
  }
  detach(element: HTMLMediaElement): HTMLMediaElement[] {
    this.attached.delete(element);
    return [element];
  }
}

export class FakeAudioTrack {
  readonly kind = Track.Kind.Audio;
  readonly elements: HTMLAudioElement[] = [];
  constructor(readonly sid: string) {}
  attach(): HTMLAudioElement {
    const element = document.createElement('audio');
    this.elements.push(element);
    return element;
  }
  detach(): HTMLMediaElement[] {
    return this.elements.splice(0);
  }
}

export class FakeParticipant {
  isSpeaking = false;
  readonly trackPublications = new Map<string, FakePublication>();

  constructor(
    readonly identity: string,
    readonly name: string,
  ) {
    this.trackPublications.set(
      `${identity}-mic`,
      new FakePublication(`${identity}-mic`, Track.Source.Microphone),
    );
    this.trackPublications.set(
      `${identity}-cam`,
      new FakePublication(`${identity}-cam`, Track.Source.Camera),
    );
  }

  getTrackPublication(source: Track.Source): FakePublication | undefined {
    return [...this.trackPublications.values()].find((pub) => pub.source === source);
  }

  get camera(): FakePublication {
    const pub = this.getTrackPublication(Track.Source.Camera);
    if (pub === undefined) throw new Error('no camera');
    return pub;
  }

  get mic(): FakePublication {
    const pub = this.getTrackPublication(Track.Source.Microphone);
    if (pub === undefined) throw new Error('no mic');
    return pub;
  }

  /** userId-ish view: `true` when every track is wanted. */
  get subscribed(): boolean {
    return [...this.trackPublications.values()].every((pub) => pub.isDesired);
  }
}

export class FakeLocalParticipant {
  isMicrophoneEnabled = false;
  isCameraEnabled = false;
  isSpeaking = false;
  micError: Error | null = null;
  cameraError: Error | null = null;
  readonly calls: string[] = [];
  readonly camera = new FakePublication('local-cam', Track.Source.Camera);

  setMicrophoneEnabled(enabled: boolean): Promise<void> {
    this.calls.push(`mic:${String(enabled)}`);
    if (enabled && this.micError !== null) return Promise.reject(this.micError);
    this.isMicrophoneEnabled = enabled;
    return Promise.resolve();
  }

  setCameraEnabled(enabled: boolean): Promise<void> {
    this.calls.push(`camera:${String(enabled)}`);
    if (enabled && this.cameraError !== null) return Promise.reject(this.cameraError);
    this.isCameraEnabled = enabled;
    this.camera.isMuted = !enabled;
    return Promise.resolve();
  }

  getTrackPublication(source: Track.Source): FakePublication | undefined {
    return source === Track.Source.Camera && this.isCameraEnabled ? this.camera : undefined;
  }
}

/** Enough of `livekit-client`'s `Room` for the `MediaController`. */
export class FakeRoom extends EventEmitter {
  state: ConnectionState = ConnectionState.Disconnected;
  canPlaybackAudio = true;
  readonly remoteParticipants = new Map<string, FakeParticipant>();
  readonly localParticipant = new FakeLocalParticipant();
  readonly connects: { url: string; token: string; options: unknown }[] = [];
  disconnects = 0;
  connectError: Error | null = null;

  constructor(readonly options: RoomOptions) {
    super();
  }

  connect(url: string, token: string, options: unknown): Promise<void> {
    this.connects.push({ url, token, options });
    if (this.connectError !== null) return Promise.reject(this.connectError);
    this.state = ConnectionState.Connected;
    return Promise.resolve();
  }

  disconnect(): Promise<void> {
    this.disconnects++;
    this.state = ConnectionState.Disconnected;
    return Promise.resolve();
  }

  startAudio(): Promise<void> {
    this.canPlaybackAudio = true;
    return Promise.resolve();
  }

  /** `[kind, deviceId]` of every device switch asked for. */
  readonly switchedDevices: [string, string][] = [];
  switchError: Error | null = null;

  switchActiveDevice(kind: string, deviceId: string): Promise<boolean> {
    this.switchedDevices.push([kind, deviceId]);
    return this.switchError === null ? Promise.resolve(true) : Promise.reject(this.switchError);
  }

  /** A remote participant joins the room with microphone and camera published. */
  addParticipant(identity: string, name = identity): FakeParticipant {
    const participant = new FakeParticipant(identity, name);
    this.remoteParticipants.set(identity, participant);
    return participant;
  }

  asRoom(): Room {
    // The fake implements the part of `Room` the controller uses.
    return this as unknown as Room;
  }
}

/** The part of the RealtimeClient the controller uses, driven by the test. */
export class FakeRealtime {
  readonly peersListeners = new Set<(payload: { peers: string[] }) => void>();
  readonly connectListeners = new Set<() => void>();

  on(event: 'media:peers', listener: (payload: { peers: string[] }) => void): () => void {
    expect(event).toBe('media:peers');
    this.peersListeners.add(listener);
    return () => this.peersListeners.delete(listener);
  }

  onConnect(listener: () => void): () => void {
    this.connectListeners.add(listener);
    return () => this.connectListeners.delete(listener);
  }

  peers(...peers: string[]): void {
    for (const listener of [...this.peersListeners]) listener({ peers });
  }

  reconnect(): void {
    for (const listener of [...this.connectListeners]) listener();
  }

  /** Typed as the realtime seam of the controller (only `on` and `onConnect` are used). */
  asRealtime(): MediaControllerDeps['realtime'] {
    return this as unknown as MediaControllerDeps['realtime'];
  }
}

/** A `MediaController` over a `FakeRoom` and a `FakeRealtime`, for component tests. */
export function testController(overrides: Partial<MediaControllerDeps> = {}): {
  controller: MediaController;
  realtime: FakeRealtime;
  events: EventBus;
  rooms: FakeRoom[];
} {
  const realtime = new FakeRealtime();
  const events = new EventBus();
  const rooms: FakeRoom[] = [];
  const controller = new MediaController({
    realtime: realtime.asRealtime(),
    events,
    store: createMediaStore(),
    fetchToken: () =>
      Promise.resolve({ url: 'ws://lk.test', token: 'token', expiresInSeconds: 600 }),
    createRoom: (options) => {
      const room = new FakeRoom(options);
      rooms.push(room);
      return room.asRoom();
    },
    reportTiming: () => undefined,
    ...overrides,
  });
  return { controller, realtime, events, rooms };
}
