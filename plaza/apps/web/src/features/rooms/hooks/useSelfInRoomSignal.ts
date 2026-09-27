import { useEffect } from 'react';

import {
  useWorldStore,
  worldEvents,
  worldStore,
  type EventBus,
  type WorldStore,
} from '@/features/world';

/**
 * Tells the rest of the app when the local person walks into a meeting room and back out
 * (`media:self-in-room`, E6-S2): the media feature turns microphone and camera off inside and
 * restores them outside. Leaving the office counts as leaving the room. Returns the current room.
 */
export function useSelfInRoomSignal(
  events: EventBus = worldEvents,
  world: WorldStore = worldStore,
): string | null {
  const roomId = useWorldStore((state) => state.localPlayer?.roomId ?? null, world);
  const inRoom = roomId !== null;
  useEffect(() => {
    if (!inRoom) return undefined;
    events.emit('media:self-in-room', { inRoom: true });
    return () => {
      events.emit('media:self-in-room', { inRoom: false });
    };
  }, [inRoom, events]);
  return roomId;
}
