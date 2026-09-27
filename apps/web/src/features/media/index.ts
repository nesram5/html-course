import type { RouteObject } from 'react-router';

import type { SpaceExtension } from '@/features/world';

import { MediaControls } from './components/MediaControls';
import { MediaLayer } from './components/MediaLayer';
import { PreJoin } from './components/PreJoin';
import es from './i18n/es.json';

/**
 * Public API of the `media` feature (E5): LiveKit: pre-join, `MediaController`, video strip and media controls. The ONLY feature allowed to import `livekit-client`.
 * Other features and `app/` import ONLY from this file (standards §5).
 */

/** Routes of the feature, mounted by `app/routes.tsx` inside the root layout. */
export const mediaRoutes: RouteObject[] = [];

/** i18n namespace `media` (texts in `./i18n/es.json`). */
export const mediaMessages = { es } as const;

/**
 * The hallway media in the office page (E5-S4..S6): the pre-join before entering, the video
 * strip and the first-use notice over the map, and the microphone and camera buttons in the
 * bottom bar. `app/` hands it to the world's `SpaceExtensionsProvider`.
 */
export const mediaSpaceExtension: SpaceExtension = {
  id: 'media',
  Gate: PreJoin,
  Overlay: MediaLayer,
  BarItems: MediaControls,
};

export { mediaController } from './controller/media-instance';
export { MediaController, type MediaControllerDeps } from './controller/media-controller';
export {
  mediaStore,
  useMediaStore,
  type MediaConnection,
  type MediaState,
  type RemoteMedia,
} from './store/media-store';
export type { MediaChoices } from './lib/media-prefs';
