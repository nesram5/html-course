import { WEB_PATHS } from '@plaza/shared';
import { createElement } from 'react';
import type { RouteObject } from 'react-router';

import { RequireAuth, RequireAvatar } from '@/features/auth';

import { SpacePage } from './components/SpacePage';
import es from './i18n/es.json';

/**
 * Public API of the `world` feature (E3, E4): Phaser integration: scenes, sprites, input, `EventBus`, `worldStore`, `RealtimeClient`. The ONLY feature allowed to import `phaser`.
 * Other features and `app/` import ONLY from this file (standards §5).
 * The React ⇄ Phaser pattern is documented in `./README.md`.
 */

/** Routes of the feature, mounted by `app/routes.tsx` inside the root layout. */
export const worldRoutes: RouteObject[] = [
  {
    // Signed in (back to `/s/:slug` after the login) and with an avatar (first-time picker).
    path: WEB_PATHS.space,
    element: createElement(
      RequireAuth,
      null,
      createElement(RequireAvatar, null, createElement(SpacePage)),
    ),
  },
];

/** i18n namespace `world` (texts in `./i18n/es.json`). */
export const worldMessages = { es } as const;

export { EventBus, worldEvents, type LocalStep, type WorldEvents } from './bridge/event-bus';
export {
  useWorldStore,
  worldStore,
  type LocalPlayerState,
  type WorldState,
} from './store/world-store';
export { ZOOM_LEVELS, type ZoomLevel } from './game/constants';
export { isTypingTarget } from './game/controller/keyboard-input';
export {
  RealtimeClient,
  RealtimeRequestError,
  isRealtimeRequestError,
  realtimeClient,
  type RealtimeErrorCode,
} from './realtime/realtime-client';
export {
  connectionStore,
  useConnectionStore,
  type ConnectionState,
  type ConnectionStatus,
} from './realtime/connection-store';
export {
  sessionStore,
  useSessionStore,
  type SessionState,
  type SpaceSessionState,
} from './realtime/space-session';
