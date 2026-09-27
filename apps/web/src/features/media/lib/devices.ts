import {
  Room,
  createAudioAnalyser,
  createLocalAudioTrack,
  createLocalVideoTrack,
  supportsAudioOutputSelection,
} from 'livekit-client';

import type { DeviceProblem } from '../store/media-store';

/** A camera preview for the pre-join. */
export interface CameraPreview {
  attach(element: HTMLVideoElement): void;
  detach(element: HTMLVideoElement): void;
  /** Releases the camera. */
  stop(): void;
}

/** A microphone opened for the level meter of the pre-join. */
export interface MicrophonePreview {
  /** Current input level, 0..1. */
  level(): number;
  /** Releases the microphone. */
  stop(): void;
}

/**
 * Local devices, as the pre-join needs them (E5-S4). The app uses {@link liveKitDevices}; tests
 * pass a fake.
 */
export interface DeviceAccess {
  /** Cameras, microphones and speakers (labels are empty until a permission is granted). */
  listDevices(): Promise<MediaDeviceInfo[]>;
  openCamera(deviceId: string | null): Promise<CameraPreview>;
  openMicrophone(deviceId: string | null): Promise<MicrophonePreview>;
  /** A device was plugged or unplugged. Returns the function that stops listening. */
  onDeviceChange(listener: () => void): () => void;
  /** Whether the browser can choose the speaker (`setSinkId`). */
  canChooseSpeaker(): boolean;
}

/** Why a device could not be opened: permission refused, or no such device. */
export function deviceProblemOf(error: unknown): DeviceProblem {
  const name = error instanceof Error ? error.name : '';
  return name === 'NotAllowedError' || name === 'SecurityError' ? 'denied' : 'unavailable';
}

/** Device access through `livekit-client` (the same capture code the controller uses). */
export const liveKitDevices: DeviceAccess = {
  async listDevices() {
    const kinds = ['videoinput', 'audioinput', 'audiooutput'] as const;
    const lists = await Promise.all(
      kinds.map((kind) => Room.getLocalDevices(kind, false).catch(() => [])),
    );
    return lists.flat();
  },

  async openCamera(deviceId) {
    const track = await createLocalVideoTrack(deviceId === null ? {} : { deviceId });
    return {
      attach: (element) => {
        track.attach(element);
      },
      detach: (element) => {
        track.detach(element);
      },
      stop: () => {
        track.stop();
      },
    };
  },

  async openMicrophone(deviceId) {
    const track = await createLocalAudioTrack(deviceId === null ? {} : { deviceId });
    const analyser = createAudioAnalyser(track, { cloneTrack: false });
    return {
      level: () => analyser.calculateVolume(),
      stop: () => {
        void analyser.cleanup();
        track.stop();
      },
    };
  },

  onDeviceChange(listener) {
    const devices = navigator.mediaDevices as MediaDevices | undefined;
    if (devices === undefined) return () => undefined;
    devices.addEventListener('devicechange', listener);
    return () => {
      devices.removeEventListener('devicechange', listener);
    };
  },

  canChooseSpeaker() {
    return supportsAudioOutputSelection();
  },
};
