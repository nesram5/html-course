import { officeStore, useOfficeStore, type SpaceSlotProps } from '@/features/world';

import { useSelfInRoomSignal } from '../hooks/useSelfInRoomSignal';
import { RoomCard } from './RoomCard';

/**
 * Meeting rooms over the office map (E6-S2): tells the media feature when the local person is in
 * a room, and shows the room card meanwhile.
 */
export function RoomsOverlay({ space }: SpaceSlotProps) {
  const roomId = useSelfInRoomSignal();
  const officeName = useOfficeStore(
    (state) => (roomId === null ? undefined : state.rooms[roomId]?.name),
    officeStore,
  );
  if (roomId === null) return null;
  return (
    <RoomCard
      key={roomId}
      spaceId={space.spaceId}
      roomId={roomId}
      roomName={space.roomNames[roomId] ?? officeName ?? roomId}
      isOwner={space.isOwner}
    />
  );
}
