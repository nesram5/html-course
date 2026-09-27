import { useCallback, useEffect, useState } from 'react';

import type { CameraPreview, DeviceAccess, MicrophonePreview } from '../lib/devices';
import { deviceProblemOf } from '../lib/devices';
import type { MediaChoices } from '../lib/media-prefs';
import type { DeviceProblem } from '../store/media-store';

/** State of one local device in the pre-join. */
export type DevicePreviewState<P> =
  | { readonly kind: 'off' }
  | { readonly kind: 'opening' }
  | { readonly kind: 'on'; readonly preview: P }
  | { readonly kind: 'problem'; readonly problem: DeviceProblem };

export interface DeviceLists {
  readonly cameras: readonly MediaDeviceInfo[];
  readonly microphones: readonly MediaDeviceInfo[];
  readonly speakers: readonly MediaDeviceInfo[];
}

const NO_DEVICES: DeviceLists = { cameras: [], microphones: [], speakers: [] };

/** How often the microphone level is sampled for the meter (ms). */
export const LEVEL_INTERVAL_MS = 100;

function split(devices: readonly MediaDeviceInfo[]): DeviceLists {
  const real = devices.filter((device) => device.deviceId !== '');
  return {
    cameras: real.filter((device) => device.kind === 'videoinput'),
    microphones: real.filter((device) => device.kind === 'audioinput'),
    speakers: real.filter((device) => device.kind === 'audiooutput'),
  };
}

/**
 * Opens a preview of one device while it is enabled, and releases it when it is disabled, the
 * device changes or the pre-join closes. Failures become a `problem` (denied / unavailable).
 */
function usePreview<P extends { stop(): void }>(
  enabled: boolean,
  deviceId: string | null,
  open: (deviceId: string | null) => Promise<P>,
  onOpened: () => void,
  attempt: number,
): DevicePreviewState<P> {
  // The result of the last request, tagged with what was asked: anything else is "opening".
  const request = `${deviceId ?? ''}#${String(attempt)}`;
  const [result, setResult] = useState<{
    readonly request: string;
    readonly state: DevicePreviewState<P>;
  } | null>(null);
  useEffect(() => {
    if (!enabled) return undefined;
    let cancelled = false;
    let preview: P | null = null;
    open(deviceId).then(
      (opened) => {
        if (cancelled) {
          opened.stop();
          return;
        }
        preview = opened;
        setResult({ request, state: { kind: 'on', preview: opened } });
        onOpened();
      },
      (error: unknown) => {
        if (!cancelled) {
          setResult({ request, state: { kind: 'problem', problem: deviceProblemOf(error) } });
        }
      },
    );
    return () => {
      cancelled = true;
      preview?.stop();
    };
  }, [enabled, deviceId, open, onOpened, request]);
  if (!enabled) return { kind: 'off' };
  return result?.request === request ? result.state : { kind: 'opening' };
}

export interface PreJoinModel {
  readonly choices: MediaChoices;
  readonly devices: DeviceLists;
  readonly camera: DevicePreviewState<CameraPreview>;
  readonly microphone: DevicePreviewState<MicrophonePreview>;
  /** Microphone input level, 0..1 (0 while off). */
  readonly level: number;
  readonly canChooseSpeaker: boolean;
  /** Some device was refused by the browser: show how to allow it. */
  readonly denied: boolean;
  readonly update: (changes: Partial<MediaChoices>) => void;
  /** Asks the browser again (after allowing the devices in the address bar). */
  readonly retry: () => void;
  /** What to publish: what is enabled AND working. */
  readonly effectiveChoices: () => MediaChoices;
}

/** State and effects of the pre-join screen (E5-S4), framework-free inputs for testing. */
export function usePreJoin(devices: DeviceAccess, initial: MediaChoices): PreJoinModel {
  const [choices, setChoices] = useState(initial);
  const [lists, setLists] = useState<DeviceLists>(NO_DEVICES);
  const [attempt, setAttempt] = useState(0);
  const [sample, setSample] = useState<{ readonly source: unknown; readonly level: number }>({
    source: null,
    level: 0,
  });

  const refreshDevices = useCallback(() => {
    devices.listDevices().then(
      (found) => {
        setLists(split(found));
      },
      () => undefined,
    );
  }, [devices]);
  const openCamera = useCallback((id: string | null) => devices.openCamera(id), [devices]);
  const openMicrophone = useCallback((id: string | null) => devices.openMicrophone(id), [devices]);

  const camera = usePreview(
    choices.videoEnabled,
    choices.videoDeviceId,
    openCamera,
    refreshDevices,
    attempt,
  );
  const microphone = usePreview(
    choices.audioEnabled,
    choices.audioDeviceId,
    openMicrophone,
    refreshDevices,
    attempt,
  );

  // Device lists: now, and whenever something is plugged or unplugged.
  useEffect(() => {
    refreshDevices();
    return devices.onDeviceChange(refreshDevices);
  }, [devices, refreshDevices]);

  // Microphone meter: sampled while the microphone is open.
  const micPreview = microphone.kind === 'on' ? microphone.preview : null;
  useEffect(() => {
    if (micPreview === null) return undefined;
    const timer = setInterval(() => {
      setSample({ source: micPreview, level: micPreview.level() });
    }, LEVEL_INTERVAL_MS);
    return () => {
      clearInterval(timer);
    };
  }, [micPreview]);
  const level = micPreview !== null && sample.source === micPreview ? sample.level : 0;

  const update = useCallback((changes: Partial<MediaChoices>) => {
    setChoices((current) => ({ ...current, ...changes }));
  }, []);
  const retry = useCallback(() => {
    setAttempt((value) => value + 1);
  }, []);

  return {
    choices,
    devices: lists,
    camera,
    microphone,
    level,
    canChooseSpeaker: devices.canChooseSpeaker(),
    denied: [camera, microphone].some(
      (state) => state.kind === 'problem' && state.problem === 'denied',
    ),
    update,
    retry,
    effectiveChoices: () => ({
      ...choices,
      audioEnabled: choices.audioEnabled && microphone.kind !== 'problem',
      videoEnabled: choices.videoEnabled && camera.kind !== 'problem',
    }),
  };
}
