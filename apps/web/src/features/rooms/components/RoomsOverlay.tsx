import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { officeStore, useOfficeStore, type SpaceSlotProps } from '@/features/world';

import { useSelfInRoomSignal } from '../hooks/useSelfInRoomSignal';
import { RoomCard } from './RoomCard';

/**
 * Meeting rooms over the office map (E6-S2): tells the media feature when the local person is in
 * a room, shows the room card meanwhile, and says so in a polite live region that is always
 * mounted (a region inserted together with its text is often not announced): walking in turns
 * the Bululu microphone and camera off.
 */
export function RoomsOverlay({ space }: SpaceSlotProps) {
  const { t } = useTranslation('rooms');
  const roomId = useSelfInRoomSignal();
  const officeName = useOfficeStore(
    (state) => (roomId === null ? undefined : state.rooms[roomId]?.name),
    officeStore,
  );
  const roomName = roomId === null ? null : (space.roomNames[roomId] ?? officeName ?? roomId);
  // What the live region says, updated during render when the room changes (no effect needed).
  const [said, setSaid] = useState<{ room: string | null; text: string }>({
    room: roomName,
    text: '',
  });
  if (said.room !== roomName) {
    const text =
      roomName !== null
        ? t('announce.entered', { name: roomName })
        : said.room !== null
          ? t('announce.left', { name: said.room })
          : '';
    setSaid({ room: roomName, text });
  }

  return (
    <>
      <p role="status" className="sr-only" data-testid="rooms-announcer">
        {said.text}
      </p>
      {roomId !== null && roomName !== null && (
        <RoomCard
          key={roomId}
          spaceId={space.spaceId}
          roomId={roomId}
          roomName={roomName}
          isOwner={space.isOwner}
        />
      )}
    </>
  );
}
