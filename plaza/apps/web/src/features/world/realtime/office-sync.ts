import type { EventBus } from '../bridge/event-bus';
import type { OfficeStore } from '../store/office-store';
import type { RealtimeClient } from './realtime-client';

/**
 * Keeps the {@link OfficeStore} in step with the server (E9, E6): the snapshot of every (re)join
 * brings the style, the held desks and the meeting rooms, then `space:theme`, `desk:updated` and
 * `room:updated` bring the changes.
 * Returns the function that stops listening and forgets the space.
 */
export function syncOffice(client: RealtimeClient, events: EventBus, office: OfficeStore) {
  const cleanups = [
    events.on('world:snapshot', (snapshot) => {
      office.getState().applySnapshot(snapshot.themeId, snapshot.desks);
      office.getState().setRooms(snapshot.rooms);
    }),
    client.on('room:updated', (room) => {
      office.getState().applyRoom(room);
    }),
    client.on('space:theme', ({ themeId }) => {
      office.getState().setTheme(themeId);
    }),
    client.on('desk:updated', (desk) => {
      office.getState().applyDesk(desk);
    }),
  ];
  return (): void => {
    for (const dispose of cleanups) dispose();
    office.getState().reset();
  };
}
