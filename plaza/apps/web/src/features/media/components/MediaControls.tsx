import { useTranslation } from 'react-i18next';

import type { SpaceInfo } from '@/features/world';

import type { MediaController } from '../controller/media-controller';
import { mediaController } from '../controller/media-instance';
import { useMediaStore } from '../store/media-store';
import { CameraIcon, CameraOffIcon, MicIcon, MicOffIcon } from './icons';

export interface MediaControlsProps {
  /** Given by the office bottom bar (unused: the controls act on the running media). */
  readonly space?: SpaceInfo;
  readonly controller?: MediaController;
}

const BUTTON =
  'grid h-10 w-10 place-items-center rounded-full transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white';

/**
 * Microphone and camera buttons of the bottom bar (E5-S6). Their label says what a click does;
 * Ctrl+D and Ctrl+E do the same from anywhere in the office. Inside a meeting room (E6-S2) they
 * are off and disabled: the meeting is in Google Meet.
 */
export function MediaControls({ controller = mediaController }: MediaControlsProps) {
  const { t } = useTranslation('media');
  const micOn = useMediaStore((state) => state.micOn, controller.store);
  const cameraOn = useMediaStore((state) => state.cameraOn, controller.store);
  const awayMuted = useMediaStore((state) => state.awayMuted, controller.store);
  const roomMuted = useMediaStore((state) => state.roomMuted, controller.store);
  const problem = useMediaStore((state) => state.deviceProblem, controller.store);

  return (
    <div className="flex items-center gap-2" data-testid="media-controls">
      <button
        type="button"
        aria-label={t(micOn ? 'controls.micOn' : 'controls.micOff')}
        aria-keyshortcuts="Control+D Meta+D"
        title={`${t(micOn ? 'controls.micOn' : 'controls.micOff')} (${t('controls.shortcutMic')})`}
        data-state={micOn ? 'on' : 'off'}
        disabled={roomMuted}
        onClick={() => {
          void controller.toggleMic();
        }}
        className={`${BUTTON} ${micOn ? 'bg-white/15 hover:bg-white/25' : 'bg-red-600 hover:bg-red-500'} disabled:cursor-not-allowed disabled:opacity-60`}
      >
        {micOn ? <MicIcon /> : <MicOffIcon />}
      </button>
      <button
        type="button"
        aria-label={t(cameraOn ? 'controls.cameraOn' : 'controls.cameraOff')}
        aria-keyshortcuts="Control+E Meta+E"
        title={`${t(cameraOn ? 'controls.cameraOn' : 'controls.cameraOff')} (${t('controls.shortcutCamera')})`}
        data-state={cameraOn ? 'on' : 'off'}
        disabled={roomMuted}
        onClick={() => {
          void controller.toggleCamera();
        }}
        className={`${BUTTON} ${cameraOn ? 'bg-white/15 hover:bg-white/25' : 'bg-red-600 hover:bg-red-500'} disabled:cursor-not-allowed disabled:opacity-60`}
      >
        {cameraOn ? <CameraIcon /> : <CameraOffIcon />}
      </button>
      {(roomMuted || awayMuted || problem === 'denied') && (
        <span role="status" className="text-xs text-slate-300">
          {roomMuted
            ? t('controls.roomMuted')
            : awayMuted
              ? t('controls.awayMuted')
              : t('controls.deviceDenied')}
        </span>
      )}
    </div>
  );
}
