import { WEB_PATHS, apiPath } from '@plaza/shared';
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';

import {
  interactionKeys,
  officeStore,
  peopleInRoom,
  useInteraction,
  useOfficeStore,
  useWorldStore,
  worldStore,
  type InteractionKeys,
  type OfficeStore,
  type WorldStore,
} from '@/features/world';
import { reportError } from '@/shared/lib/sentry';

import { trackEvent } from '../api/events-api';

/** Priority of "Unirse a la reunión" on the interaction key: over the desk menu (10). */
export const MEETING_INTERACTION_PRIORITY = 20;

export interface RoomCardProps {
  readonly spaceId: string;
  /** The meeting room the local person is in. */
  readonly roomId: string;
  /** Name of the room on the map ("Sala 1"). */
  readonly roomName: string;
  /** The local person owns the space: offered to add the missing Meet link. */
  readonly isOwner: boolean;
  readonly world?: WorldStore;
  readonly office?: OfficeStore;
  readonly keys?: InteractionKeys;
  /** Opens the Meet in a new tab (`window.open` with `noopener,noreferrer` by default). */
  readonly openMeet?: (url: string) => void;
  /** Records `room_meet_opened` (metric O6). */
  readonly track?: typeof trackEvent;
}

function openInNewTab(url: string): void {
  window.open(url, '_blank', 'noopener,noreferrer');
}

/**
 * "Estás en Sala 1 · 2 personas dentro · Unirse a la reunión" (E6-S2), shown while the local
 * person stands in a meeting room. The hallway is cut meanwhile (the server stops sending
 * hallway peers, and the media feature keeps the Plaza microphone and camera off, so joining the
 * Meet never duplicates the audio). "Unirse a la reunión" (or `X`) opens the room's Meet in a new
 * tab. A room without a Meet link says so and offers owners to add one.
 */
export function RoomCard({
  spaceId,
  roomId,
  roomName,
  isOwner,
  world = worldStore,
  office = officeStore,
  keys = interactionKeys,
  openMeet = openInNewTab,
  track = trackEvent,
}: RoomCardProps) {
  const { t } = useTranslation('rooms');
  const people = useWorldStore((state) => peopleInRoom(state, roomId), world);
  const meetUri = useOfficeStore((state) => state.rooms[roomId]?.meetUri ?? null, office);

  const join = useCallback(() => {
    if (meetUri === null) return;
    // The Plaza microphone and camera are already off inside the room (`media:self-in-room`).
    openMeet(meetUri);
    track(spaceId, { name: 'room_meet_opened', props: { areaId: roomId } }).catch(reportError);
  }, [meetUri, openMeet, track, spaceId, roomId]);
  const xJoins = useInteraction(
    'meeting-room',
    MEETING_INTERACTION_PRIORITY,
    meetUri === null ? null : join,
    keys,
  );

  return (
    <section
      aria-label={t('card.label')}
      data-testid="room-card"
      data-room={roomId}
      className="pointer-events-auto absolute top-3 left-1/2 z-10 flex w-max max-w-[calc(100%-2rem)] -translate-x-1/2 flex-wrap items-center gap-x-3 gap-y-2 rounded-xl bg-white/95 px-4 py-3 text-sm text-slate-800 shadow-lg"
    >
      <span aria-hidden="true">📹</span>
      <p role="status" className="font-medium">
        {t('card.inRoom', { name: roomName })}
        <span aria-hidden="true"> · </span>
        <span className="font-normal text-slate-600">{t('card.people', { count: people })}</span>
      </p>
      {meetUri !== null ? (
        <button
          type="button"
          onClick={join}
          aria-keyshortcuts={xJoins ? 'x' : undefined}
          aria-describedby={`room-card-hint-${roomId}`}
          className="rounded-md bg-indigo-600 px-3 py-1.5 font-medium text-white hover:bg-indigo-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
        >
          {xJoins && (
            <kbd className="mr-2 rounded bg-white/20 px-1.5 font-mono" aria-hidden="true">
              X
            </kbd>
          )}
          {t('card.join')}
        </button>
      ) : (
        <p className="text-slate-600">
          {t('card.noMeet')}{' '}
          {isOwner ? (
            <a
              href={`${apiPath(WEB_PATHS.spaceSettings, { spaceId })}#salas`}
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-indigo-700 underline hover:text-indigo-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
            >
              {t('card.addMeet')}
            </a>
          ) : (
            t('card.askOwner')
          )}
        </p>
      )}
      <p id={`room-card-hint-${roomId}`} className="w-full text-xs text-slate-600">
        {t(meetUri !== null ? 'card.joinHint' : 'card.hallwayCut')}
      </p>
    </section>
  );
}
