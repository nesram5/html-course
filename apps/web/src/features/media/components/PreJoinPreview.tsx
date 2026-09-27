import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';

import type { DevicePreviewState } from '../hooks/usePreJoin';
import type { CameraPreview, MicrophonePreview } from '../lib/devices';

export interface PreJoinPreviewProps {
  readonly camera: DevicePreviewState<CameraPreview>;
  readonly microphone: DevicePreviewState<MicrophonePreview>;
  /** 0..1 */
  readonly level: number;
}

/** Camera preview (mirrored, like a mirror) and microphone level meter of the pre-join. */
export function PreJoinPreview({ camera, microphone, level }: PreJoinPreviewProps) {
  const { t } = useTranslation('media');
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const element = videoRef.current;
    if (camera.kind !== 'on' || element === null) return undefined;
    camera.preview.attach(element);
    return () => {
      camera.preview.detach(element);
    };
  }, [camera]);

  const percent = Math.round(Math.min(1, level) * 100);
  let placeholder: string | null = null;
  if (camera.kind === 'off') placeholder = t('prejoin.cameraOff');
  else if (camera.kind === 'opening') placeholder = t('prejoin.cameraOpening');
  else if (camera.kind === 'problem' && camera.problem === 'unavailable') {
    placeholder = t('prejoin.unavailable');
  } else if (camera.kind === 'problem') placeholder = t('prejoin.cameraOff');

  return (
    <div className="flex flex-col gap-2">
      <div className="relative aspect-video overflow-hidden rounded-xl bg-slate-800">
        <video
          ref={videoRef}
          aria-label={t('prejoin.previewLabel')}
          data-testid="prejoin-preview"
          autoPlay
          muted
          playsInline
          className={`h-full w-full -scale-x-100 object-cover ${camera.kind === 'on' ? '' : 'hidden'}`}
        />
        {placeholder !== null && (
          <p className="absolute inset-0 grid place-items-center p-4 text-center text-sm text-slate-200">
            {placeholder}
          </p>
        )}
      </div>
      <div className="flex items-center gap-2">
        <span className="text-sm text-slate-700" id="prejoin-level-label">
          {t('prejoin.levelLabel')}
        </span>
        <div
          role="meter"
          aria-labelledby="prejoin-level-label"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent}
          data-testid="mic-level"
          className="h-2 flex-1 overflow-hidden rounded-full bg-slate-200"
        >
          <div
            className={`h-full rounded-full transition-[width] duration-100 ${microphone.kind === 'on' ? 'bg-emerald-500' : 'bg-slate-300'}`}
            style={{ width: `${String(percent)}%` }}
          />
        </div>
      </div>
      {microphone.kind === 'problem' && microphone.problem === 'unavailable' && (
        <p className="text-sm text-amber-800">{t('prejoin.unavailable')}</p>
      )}
    </div>
  );
}
