import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import type { SpaceGateProps } from '@/features/world';
import { useDialog } from '@/shared/ui';

import { usePreJoin } from '../hooks/usePreJoin';
import { liveKitDevices, type DeviceAccess } from '../lib/devices';
import { loadMediaChoices, saveMediaChoices, type PrefsStorage } from '../lib/media-prefs';
import { mediaStore, type MediaStore } from '../store/media-store';
import { DeviceSelect } from './DeviceSelect';
import { PreJoinPreview } from './PreJoinPreview';

export interface PreJoinProps extends SpaceGateProps {
  readonly devices?: DeviceAccess;
  readonly store?: MediaStore;
  /** Where the choices are remembered (`localStorage` by default). */
  readonly storage?: PrefsStorage | null;
}

const TOGGLE =
  'flex items-center gap-2 rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-800 focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-indigo-600';

/**
 * Pre-join (E5-S4), shown over the office before entering: camera preview, microphone level,
 * device selectors (camera, microphone, speaker) and on/off toggles. Choices are remembered in
 * this browser. When the browser refuses the devices, the person can still enter without media
 * and is told how to allow them.
 */
export function PreJoin({
  space,
  onDone,
  devices = liveKitDevices,
  store = mediaStore,
  storage,
}: PreJoinProps) {
  const { t } = useTranslation('media');
  const [initial] = useState(() =>
    storage === undefined ? loadMediaChoices() : loadMediaChoices(storage),
  );
  const model = usePreJoin(devices, initial);
  const { choices, update } = model;
  // A real modal (it is aria-modal): Tab stays inside, and no key reaches the map behind it
  // (arrows scroll the dialog instead of walking). Escape does nothing: there is no "closed"
  // state, the office is entered with one of the two buttons.
  const dialogRef = useDialog<HTMLElement>(() => undefined);

  const enter = (): void => {
    if (storage === undefined) saveMediaChoices(choices);
    else saveMediaChoices(choices, storage);
    store.getState().setChoices(model.effectiveChoices());
    onDone();
  };
  const effective = model.effectiveChoices();
  const withoutMedia = !effective.audioEnabled && !effective.videoEnabled;

  return (
    <div className="absolute inset-0 z-20 overflow-y-auto bg-slate-900/80 p-4">
      <section
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="prejoin-title"
        aria-describedby="prejoin-subtitle"
        data-testid="prejoin"
        className="mx-auto my-8 flex w-full max-w-xl flex-col gap-4 rounded-2xl bg-white p-6 shadow-xl"
      >
        <header>
          <h2 id="prejoin-title" className="text-xl font-semibold text-slate-900">
            {t('prejoin.title')}
          </h2>
          <p id="prejoin-subtitle" className="text-sm text-slate-600">
            {space.spaceName} · {t('prejoin.subtitle')}
          </p>
        </header>

        <PreJoinPreview camera={model.camera} microphone={model.microphone} level={model.level} />

        <div className="flex flex-wrap gap-2">
          <label className={TOGGLE}>
            <input
              type="checkbox"
              checked={choices.videoEnabled}
              onChange={(event) => {
                update({ videoEnabled: event.target.checked });
              }}
            />
            {t('prejoin.cameraOn')}
          </label>
          <label className={TOGGLE}>
            <input
              type="checkbox"
              checked={choices.audioEnabled}
              onChange={(event) => {
                update({ audioEnabled: event.target.checked });
              }}
            />
            {t('prejoin.micOn')}
          </label>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <DeviceSelect
            label={t('prejoin.camera')}
            devices={model.devices.cameras}
            value={choices.videoDeviceId}
            disabled={!choices.videoEnabled}
            onChange={(videoDeviceId) => {
              update({ videoDeviceId });
            }}
          />
          <DeviceSelect
            label={t('prejoin.microphone')}
            devices={model.devices.microphones}
            value={choices.audioDeviceId}
            disabled={!choices.audioEnabled}
            onChange={(audioDeviceId) => {
              update({ audioDeviceId });
            }}
          />
          {model.canChooseSpeaker && (
            <DeviceSelect
              label={t('prejoin.speaker')}
              devices={model.devices.speakers}
              value={choices.audioOutputDeviceId}
              onChange={(audioOutputDeviceId) => {
                update({ audioOutputDeviceId });
              }}
            />
          )}
        </div>

        {model.denied && (
          <div role="alert" className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
            <p className="font-semibold">{t('prejoin.deniedTitle')}</p>
            <p>{t('prejoin.deniedHelp')}</p>
            <button
              type="button"
              onClick={model.retry}
              className="mt-2 rounded-md border border-amber-700 px-3 py-1 font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-700"
            >
              {t('prejoin.retry')}
            </button>
          </div>
        )}

        <footer className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-slate-600">{t('prejoin.remembered')}</p>
          <button
            data-autofocus
            type="button"
            onClick={enter}
            className="rounded-md bg-indigo-600 px-5 py-2 text-sm font-semibold text-white hover:bg-indigo-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
          >
            {withoutMedia ? t('prejoin.enterWithoutMedia') : t('prejoin.enter')}
          </button>
        </footer>
      </section>
    </div>
  );
}
