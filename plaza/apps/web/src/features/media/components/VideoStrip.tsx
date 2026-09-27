import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';

import { useWorldStore } from '@/features/world';

import type { MediaController } from '../controller/media-controller';
import { tileDistance, videoOpacity } from '../lib/video-opacity';
import { useMediaStore, type RemoteMedia } from '../store/media-store';
import { VideoTile } from './VideoTile';

export interface VideoStripProps {
  readonly controller: MediaController;
}

/**
 * Videos of the hallway conversation over the map (E5-S6): one tile per peer connected to the
 * media server (plus my own view), fading with the distance, highlighted while speaking, and
 * enlarged on click. Also offers "Activar el sonido" when the browser blocks audio.
 */
export function VideoStrip({ controller }: VideoStripProps) {
  const { t } = useTranslation('media');
  const store = controller.store;
  const peers = useMediaStore((state) => state.peers, store);
  const participants = useMediaStore((state) => state.participants, store);
  const focused = useMediaStore((state) => state.focused, store);
  const connection = useMediaStore((state) => state.connection, store);
  const audioBlocked = useMediaStore((state) => state.audioBlocked, store);
  const micOn = useMediaStore((state) => state.micOn, store);
  const localVideo = useMediaStore((state) => state.localVideoTrackSid, store);
  const localSpeaking = useMediaStore((state) => state.localSpeaking, store);
  const me = useWorldStore((state) => state.localPlayer);
  const players = useWorldStore((state) => state.players);

  const attachLocal = useCallback(
    (element: HTMLVideoElement) => controller.attachLocalVideo(element),
    [controller],
  );
  const tiles = peers.flatMap((userId) => {
    const media = participants[userId];
    return media === undefined ? [] : [media];
  });

  function opacityOf(media: RemoteMedia): number {
    const player = players.get(media.userId);
    if (me === null || player === undefined) return 1;
    return videoOpacity(tileDistance(me, player));
  }

  return (
    <section
      aria-label={t('strip.label')}
      data-testid="video-strip"
      data-connection={connection}
      className="pointer-events-none absolute inset-x-0 top-12 z-10 flex flex-col items-center gap-2 px-3"
    >
      {connection === 'reconnecting' && (
        <p role="status" className="rounded-full bg-slate-900/85 px-3 py-1 text-xs text-white">
          {t('strip.reconnecting')}
        </p>
      )}
      {audioBlocked && tiles.length > 0 && (
        <button
          type="button"
          onClick={() => {
            void controller.startAudio();
          }}
          className="pointer-events-auto rounded-full bg-amber-400 px-4 py-1.5 text-sm font-semibold text-slate-900 shadow focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
        >
          {t('strip.enableAudio')}
        </button>
      )}
      {tiles.length > 0 && (
        <ul className="pointer-events-auto flex max-w-full flex-wrap items-start justify-center gap-2">
          <VideoTile
            userId="self"
            name={t('strip.you')}
            micOn={micOn}
            speaking={localSpeaking}
            videoTrackSid={localVideo}
            attach={attachLocal}
            mirrored
          />
          {tiles.map((media) => (
            <PeerTile
              key={media.userId}
              media={media}
              name={players.get(media.userId)?.displayName ?? media.name}
              opacity={opacityOf(media)}
              focused={focused === media.userId}
              controller={controller}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function PeerTile({
  media,
  name,
  opacity,
  focused,
  controller,
}: {
  readonly media: RemoteMedia;
  /** The current display name (from the world state), the media server's one otherwise. */
  readonly name: string;
  readonly opacity: number;
  readonly focused: boolean;
  readonly controller: MediaController;
}) {
  const { userId } = media;
  const attach = useCallback(
    (element: HTMLVideoElement) => controller.attachVideo(userId, element),
    [controller, userId],
  );
  const firstFrame = useCallback(() => {
    controller.firstFrame(userId);
  }, [controller, userId]);
  return (
    <VideoTile
      userId={userId}
      name={name}
      micOn={media.micOn}
      speaking={media.speaking}
      videoTrackSid={media.videoTrackSid}
      attach={attach}
      opacity={opacity}
      focused={focused}
      onToggleFocus={() => {
        controller.focus(focused ? null : userId);
      }}
      onFirstFrame={firstFrame}
    />
  );
}
