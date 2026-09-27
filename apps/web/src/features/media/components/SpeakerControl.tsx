import { useEffect, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useDialog } from '@/shared/ui';

import type { MediaController } from '../controller/media-controller';
import { liveKitDevices, type DeviceAccess } from '../lib/devices';
import { saveMediaChoices } from '../lib/media-prefs';
import { useMediaStore } from '../store/media-store';
import { DeviceSelect } from './DeviceSelect';
import { SpeakerIcon } from './icons';

export interface SpeakerControlProps {
  readonly controller: MediaController;
  readonly devices?: DeviceAccess;
  /** Where the choice is remembered; `localStorage` by default. */
  readonly remember?: typeof saveMediaChoices;
}

/** Speakers plugged in now, refreshed when a device is plugged or unplugged. */
function useSpeakers(devices: DeviceAccess): MediaDeviceInfo[] {
  const [speakers, setSpeakers] = useState<MediaDeviceInfo[]>([]);
  useEffect(() => {
    let active = true;
    const refresh = () => {
      void devices.listDevices().then((all) => {
        if (active) setSpeakers(all.filter((device) => device.kind === 'audiooutput'));
      });
    };
    refresh();
    const stop = devices.onDeviceChange(refresh);
    return () => {
      active = false;
      stop();
    };
  }, [devices]);
  return speakers;
}

function SpeakerPopover({
  controller,
  speakers,
  remember,
  onClose,
}: {
  readonly controller: MediaController;
  readonly speakers: readonly MediaDeviceInfo[];
  readonly remember: typeof saveMediaChoices;
  readonly onClose: () => void;
}) {
  const { t } = useTranslation('media');
  const titleId = useId();
  const ref = useDialog<HTMLDivElement>(onClose);
  const choices = useMediaStore((state) => state.choices, controller.store);
  return (
    <div
      ref={ref}
      role="dialog"
      aria-labelledby={titleId}
      className="absolute bottom-12 left-0 z-20 flex w-72 flex-col gap-2 rounded-xl bg-white p-3 text-slate-900 shadow-xl"
    >
      <h2 id={titleId} className="sr-only">
        {t('controls.speakerChoose')}
      </h2>
      <DeviceSelect
        label={t('controls.speakerLabel')}
        devices={speakers}
        value={choices?.audioOutputDeviceId ?? null}
        onChange={(deviceId) => {
          void controller.setAudioOutput(deviceId);
          const next = controller.store.getState().choices;
          if (next !== null) remember(next);
        }}
      />
      <button
        type="button"
        className="self-end rounded-md border border-slate-300 px-3 py-1 text-sm hover:bg-slate-50"
        onClick={onClose}
      >
        {t('controls.speakerClose')}
      </button>
    </div>
  );
}

/**
 * Speaker switch of the bottom bar (E5 follow-up): changes where the hallway sounds during the
 * call, without leaving it. Only shown where the browser can choose the speaker (`setSinkId`).
 */
export function SpeakerControl({
  controller,
  devices = liveKitDevices,
  remember = saveMediaChoices,
}: SpeakerControlProps) {
  const { t } = useTranslation('media');
  const popoverId = useId();
  const [open, setOpen] = useState(false);
  const speakers = useSpeakers(devices);
  const chosen = useMediaStore(
    (state) => state.choices?.audioOutputDeviceId ?? null,
    controller.store,
  );
  if (!devices.canChooseSpeaker()) return null;
  const label = speakers.find((device) => device.deviceId === chosen)?.label ?? '';
  const name = label === '' ? t('controls.speakerDefault') : label;

  return (
    <div className="relative">
      <button
        type="button"
        aria-label={t('controls.speaker', { name })}
        aria-expanded={open}
        aria-controls={open ? popoverId : undefined}
        title={t('controls.speakerChoose')}
        onClick={() => {
          setOpen((value) => !value);
        }}
        className="grid h-10 w-10 place-items-center rounded-full bg-white/15 transition hover:bg-white/25 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
      >
        <SpeakerIcon />
      </button>
      {open && (
        <div id={popoverId}>
          <SpeakerPopover
            controller={controller}
            speakers={speakers}
            remember={remember}
            onClose={() => {
              setOpen(false);
            }}
          />
        </div>
      )}
    </div>
  );
}
