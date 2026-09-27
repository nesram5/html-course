import type { SpaceDetailDto } from '@bululu/shared';
import { useId } from 'react';
import { useTranslation } from 'react-i18next';

import { useAuthorizeRooms } from '../hooks/useSpaces';
import { browser } from '../lib/browser';
import { RoomRow } from './RoomRow';

/**
 * Meeting rooms of the space (E2-S7): "Crear salas de reunión" asks Google for permission and
 * creates one Meet per room; each room can also get a link pasted by hand.
 */
export function RoomsSettings({ space }: { space: SpaceDetailDto }) {
  const { t } = useTranslation('spaces');
  const titleId = useId();
  const authorize = useAuthorizeRooms(space.id);
  const isOwner = space.role === 'OWNER';
  const missing = space.rooms.some((room) => room.meetUri === null);
  const created = space.rooms.some((room) => room.source === 'api');

  return (
    // `#salas`: the room card of the office links here when a room has no Meet link (E6-S2).
    <section id="salas" aria-labelledby={titleId} className="flex flex-col gap-3 scroll-mt-4">
      <h2 id={titleId} className="text-lg font-semibold">
        {t('rooms.title')}
      </h2>
      {space.rooms.length === 0 ? (
        <p className="text-sm text-slate-600">{t('rooms.none')}</p>
      ) : (
        <ul>
          {space.rooms.map((room) => (
            <RoomRow key={room.areaId} spaceId={space.id} room={room} canEdit={isOwner} />
          ))}
        </ul>
      )}
      {isOwner && missing && (
        <button
          type="button"
          disabled={authorize.isPending}
          className="self-start rounded-md bg-brand-600 px-4 py-2 font-medium text-white hover:bg-brand-700 disabled:opacity-50"
          onClick={() => {
            authorize.mutate(undefined, {
              onSuccess: (url) => {
                browser.assign(url);
              },
            });
          }}
        >
          {t(created ? 'rooms.retry' : 'rooms.create')}
        </button>
      )}
    </section>
  );
}
