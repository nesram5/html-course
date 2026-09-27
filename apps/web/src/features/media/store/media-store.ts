import { useStore } from 'zustand';
import { createStore, type StoreApi } from 'zustand/vanilla';

import type { MediaChoices } from '../lib/media-prefs';

/** Connection to the media server (LiveKit). */
export type MediaConnection =
  | 'idle'
  | 'connecting'
  | 'connected'
  /** Lost: LiveKit (or the controller) is reconnecting by itself. */
  | 'reconnecting'
  /** Ended for good (removed from the space, the same person in another tab). */
  | 'disconnected';

/** Why the local microphone or camera cannot be used. */
export type DeviceProblem = 'denied' | 'unavailable';

/** A hallway peer as the video strip draws it. */
export interface RemoteMedia {
  readonly userId: string;
  readonly name: string;
  readonly micOn: boolean;
  readonly cameraOn: boolean;
  readonly speaking: boolean;
  /** Changes when the video track to attach changes (`null`: no video). */
  readonly videoTrackSid: string | null;
}

export interface MediaData {
  /** Chosen in the pre-join; `null` until then. */
  readonly choices: MediaChoices | null;
  readonly connection: MediaConnection;
  /** Microphone and camera currently published (the controls show these). */
  readonly micOn: boolean;
  readonly cameraOn: boolean;
  /** Changes when the local camera track changes (self view). */
  readonly localVideoTrackSid: string | null;
  readonly localSpeaking: boolean;
  /** Muted because the person went away (E7); restored when they come back. */
  readonly awayMuted: boolean;
  /**
   * Off because the person is in a meeting room (E6-S2): the meeting is in Google Meet; restored
   * when they walk out. The controls are disabled meanwhile.
   */
  readonly roomMuted: boolean;
  readonly deviceProblem: DeviceProblem | null;
  /** The browser blocks audio playback until the person interacts with the page. */
  readonly audioBlocked: boolean;
  /** Last `media:peers` (sorted userIds). */
  readonly peers: readonly string[];
  /** userIds whose tracks this client asked LiveKit for: always a subset of `peers`. */
  readonly subscribed: readonly string[];
  /** Hallway peers connected to the media server, by userId. */
  readonly participants: Readonly<Record<string, RemoteMedia>>;
  /** Enlarged video (high simulcast layer), if any. */
  readonly focused: string | null;
  /** Recent times from `media:peers` to the first video frame, in ms (metric, E5-S5). */
  readonly firstFrameMs: readonly number[];
}

export interface MediaState extends MediaData {
  patch(data: Partial<MediaData>): void;
  setChoices(choices: MediaChoices): void;
  recordFirstFrame(ms: number): void;
  /** Back to the initial state when leaving the office; keeps the pre-join choices. */
  reset(): void;
}

export type MediaStore = StoreApi<MediaState>;

const FIRST_FRAME_SAMPLES = 50;

const INITIAL: Omit<MediaData, 'choices'> = {
  connection: 'idle',
  micOn: false,
  cameraOn: false,
  localVideoTrackSid: null,
  localSpeaking: false,
  awayMuted: false,
  roomMuted: false,
  deviceProblem: null,
  audioBlocked: false,
  peers: [],
  subscribed: [],
  participants: {},
  focused: null,
  firstFrameMs: [],
};

/** Live state of the hallway media (standards §5: one store per domain). */
export function createMediaStore(): MediaStore {
  return createStore<MediaState>()((set) => ({
    choices: null,
    ...INITIAL,
    patch: (data) => {
      set(data);
    },
    setChoices: (choices) => {
      set({ choices });
    },
    recordFirstFrame: (ms) => {
      set((state) => ({ firstFrameMs: [...state.firstFrameMs, ms].slice(-FIRST_FRAME_SAMPLES) }));
    },
    reset: () => {
      set(INITIAL);
    },
  }));
}

/** The app-wide media store, written only by the `MediaController` and the pre-join. */
export const mediaStore = createMediaStore();

export function useMediaStore<T>(
  selector: (state: MediaState) => T,
  store: MediaStore = mediaStore,
): T {
  return useStore(store, selector);
}
