import { useEffect, useRef, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { MicOffIcon } from './icons';

export interface VideoTileProps {
  readonly userId: string;
  readonly name: string;
  readonly micOn: boolean;
  readonly speaking: boolean;
  /** Changes when the track to attach changes; `null`: no video. */
  readonly videoTrackSid: string | null;
  /** Attaches the video to the element; returns the detach function. */
  readonly attach: (element: HTMLVideoElement) => () => void;
  /** 0..1, fading with the distance (E5-S6). */
  readonly opacity?: number;
  readonly focused?: boolean;
  readonly mirrored?: boolean;
  /** Toggles the enlarged view; `undefined` for the self view (not clickable). */
  readonly onToggleFocus?: () => void;
  /** The first frame is shown (metric, E5-S5). */
  readonly onFirstFrame?: () => void;
  /**
   * Drawn over the whole tile, outside its button (e.g. the "Ausente · Llamar" card of
   * `presence`, which has its own button). An element that renders nothing leaves the tile free.
   */
  readonly cover?: ReactNode;
}

/**
 * One video of the hallway strip (E5-S6): name, microphone indicator, highlighted border while
 * speaking, and a click (or Enter/Space) to enlarge it. `cover` goes over it (away card).
 */
export function VideoTile(props: VideoTileProps) {
  const { userId, name, micOn, speaking, videoTrackSid, attach, onFirstFrame } = props;
  const { opacity = 1, focused = false, mirrored = false, onToggleFocus, cover } = props;
  const { t } = useTranslation('media');
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const element = videoRef.current;
    if (element === null || videoTrackSid === null) return undefined;
    const detach = attach(element);
    const loaded = (): void => {
      onFirstFrame?.();
    };
    element.addEventListener('loadeddata', loaded, { once: true });
    return () => {
      element.removeEventListener('loadeddata', loaded);
      detach();
    };
  }, [attach, onFirstFrame, videoTrackSid]);

  const body = (
    <>
      <video
        ref={videoRef}
        data-testid="hallway-video-element"
        autoPlay
        muted
        playsInline
        className={`h-full w-full object-cover ${mirrored ? '-scale-x-100' : ''} ${videoTrackSid === null ? 'hidden' : ''}`}
      />
      {videoTrackSid === null && (
        <span className="absolute inset-0 grid place-items-center text-2xl font-semibold text-white">
          {name.slice(0, 1).toUpperCase()}
          <span className="sr-only">{t('strip.noVideo')}</span>
        </span>
      )}
      <span className="absolute inset-x-1 bottom-1 flex items-center gap-1 truncate rounded bg-slate-900/70 px-1.5 py-0.5 text-xs text-white">
        {!micOn && <MicOffIcon label={t('strip.micMuted')} className="h-3 w-3 shrink-0" />}
        <span className="truncate">{name}</span>
        {speaking && <span className="sr-only">{t('strip.speaking')}</span>}
      </span>
    </>
  );
  const frame = `relative block overflow-hidden rounded-xl bg-slate-700 shadow-lg ring-3 transition ${
    speaking ? 'ring-emerald-400' : 'ring-transparent'
  } ${focused ? 'h-60 w-96 max-w-[90vw]' : 'h-24 w-36'}`;

  return (
    <li
      data-testid="hallway-video"
      data-user-id={userId}
      data-speaking={speaking}
      style={{ opacity }}
      className="relative transition-opacity duration-300"
    >
      {onToggleFocus === undefined ? (
        <div className={frame}>{body}</div>
      ) : (
        <button
          type="button"
          aria-label={t(focused ? 'strip.shrink' : 'strip.enlarge', { name })}
          aria-pressed={focused}
          onClick={onToggleFocus}
          className={`${frame} cursor-zoom-in focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white`}
        >
          {body}
        </button>
      )}
      {cover !== undefined && (
        <div data-testid="hallway-video-cover" className="absolute inset-0 grid empty:hidden">
          {cover}
        </div>
      )}
    </li>
  );
}
