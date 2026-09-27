import { useTranslation } from 'react-i18next';

import type { SpaceInfo } from '@/features/world';

import type { MediaController } from '../controller/media-controller';
import { mediaController } from '../controller/media-instance';
import type { DeviceAccess } from '../lib/devices';
import { useMediaStore } from '../store/media-store';
import { CameraIcon, CameraOffIcon, MicIcon, MicOffIcon } from './icons';
import { SpeakerControl } from './SpeakerControl';

export interface MediaControlsProps {
  /** Given by the office bottom bar (unused: the controls act on the running media). */
  readonly space?: SpaceInfo;
  readonly controller?: MediaController;
  /** Speakers for the in-call switch; the browser's through LiveKit by default. */
  readonly devices?: DeviceAccess;
}

const BUTTON =
  'grid h-10 w-10 place-items-center rounded-full transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white';

/**
 * Microphone and camera buttons of the bottom bar (E5-S6). Their label says what a click does;
 * Ctrl+D and Ctrl+E do the same from anywhere in the office. Inside a meeting room (E6-S2) they
 * are off and do nothing (`aria-disabled`, so a focused button keeps the focus): the meeting is in
 * Google Meet, which the room card and the rooms live region say. Then the speaker switch, and a
 * live region, always mounted, for the away and permission notes.
 */
export function MediaControls({ controller = mediaController, devices }: MediaControlsProps) {
  const { t } = useTranslation('media');
  const micOn = useMediaStore((state) => state.micOn, controller.store);
  const cameraOn = useMediaStore((state) => state.cameraOn, controller.store);
  const awayMuted = useMediaStore((state) => state.awayMuted, controller.store);
  const roomMuted = useMediaStore((state) => state.roomMuted, controller.store);
  const problem = useMediaStore((state) => state.deviceProblem, controller.store);
  const note = roomMuted
    ? ''
    : awayMuted
      ? t('controls.awayMuted')
      : problem === 'denied'
        ? t('controls.deviceDenied')
        : '';

  return (
    <div className="flex items-center gap-2" data-testid="media-controls">
      <button
        type="button"
        aria-label={t(micOn ? 'controls.micOn' : 'controls.micOff')}
        aria-keyshortcuts="Control+D Meta+D"
        title={
          roomMuted
            ? t('controls.roomMuted')
            : `${t(micOn ? 'controls.micOn' : 'controls.micOff')} (${t('controls.shortcutMic')})`
        }
        data-state={micOn ? 'on' : 'off'}
        aria-disabled={roomMuted || undefined}
        onClick={() => {
          if (!roomMuted) void controller.toggleMic();
        }}
        className={`${BUTTON} ${micOn ? 'bg-white/15 hover:bg-white/25' : 'bg-red-600 hover:bg-red-500'} aria-disabled:cursor-not-allowed aria-disabled:opacity-60`}
      >
        {micOn ? <MicIcon /> : <MicOffIcon />}
      </button>
      <button
        type="button"
        aria-label={t(cameraOn ? 'controls.cameraOn' : 'controls.cameraOff')}
        aria-keyshortcuts="Control+E Meta+E"
        title={
          roomMuted
            ? t('controls.roomMuted')
            : `${t(cameraOn ? 'controls.cameraOn' : 'controls.cameraOff')} (${t('controls.shortcutCamera')})`
        }
        data-state={cameraOn ? 'on' : 'off'}
        aria-disabled={roomMuted || undefined}
        onClick={() => {
          if (!roomMuted) void controller.toggleCamera();
        }}
        className={`${BUTTON} ${cameraOn ? 'bg-white/15 hover:bg-white/25' : 'bg-red-600 hover:bg-red-500'} aria-disabled:cursor-not-allowed aria-disabled:opacity-60`}
      >
        {cameraOn ? <CameraIcon /> : <CameraOffIcon />}
      </button>
      <SpeakerControl controller={controller} {...(devices !== undefined && { devices })} />
      {/* Always mounted: a live region inserted with its text is often not announced. The room
          note is left to the rooms overlay (and the buttons' tooltip): here it would stretch
          the bar under the side panels. */}
      <span role="status" className={note === '' ? 'sr-only' : 'text-xs text-slate-300'}>
        {note}
      </span>
    </div>
  );
}
