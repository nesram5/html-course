import type { RouteObject } from 'react-router';

import type { SpaceExtension } from '@/features/world';

import { RoomsOverlay } from './components/RoomsOverlay';
import es from './i18n/es.json';

/**
 * Public API of the `rooms` feature (E6): Meeting room card and "Unirse a la reunión".
 * Other features and `app/` import ONLY from this file (standards §5).
 */

/** Routes of the feature, mounted by `app/routes.tsx` inside the root layout. */
export const roomsRoutes: RouteObject[] = [];

/** i18n namespace `rooms` (texts in `./i18n/es.json`). */
export const roomsMessages = { es } as const;

/**
 * Meeting rooms in the office page (E6-S2): the room card over the map while the local person
 * is in a room, and the `media:self-in-room` signal that keeps the Plaza microphone and camera off
 * meanwhile. `app/` hands it to the world's `SpaceExtensionsProvider`.
 */
export const roomsSpaceExtension: SpaceExtension = {
  id: 'rooms',
  Overlay: RoomsOverlay,
};

export { RoomCard, MEETING_INTERACTION_PRIORITY, type RoomCardProps } from './components/RoomCard';
export { useSelfInRoomSignal } from './hooks/useSelfInRoomSignal';
