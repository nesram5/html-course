import type { RouteObject } from 'react-router';

import type { SpaceExtension } from '@/features/world';

import { PresenceBarItems, PresenceSidePanel } from './components/PresenceSpaceItems';
import es from './i18n/es.json';

/**
 * Public API of the `presence` feature (E7): Status, away detection, member list, locate and ring.
 * Other features and `app/` import ONLY from this file (standards §5).
 *
 * The office page gets it through {@link presenceSpaceExtension} (listed in `app/`), so `world`
 * never imports this feature.
 */

/** Routes of the feature, mounted by `app/routes.tsx` inside the root layout. */
export const presenceRoutes: RouteObject[] = [];

/** i18n namespace `presence` (texts in `./i18n/es.json`). */
export const presenceMessages = { es } as const;

/**
 * Presence in the office page (E7-S1, E7-S2, E7-S5): status menu and "Personas" in the bottom
 * bar, the "Personas" side panel, and the presence session (away detection, rings).
 */
export const presenceSpaceExtension: SpaceExtension = {
  id: 'presence',
  BarItems: PresenceBarItems,
  Panel: PresenceSidePanel,
};

export { AwayCard, type AwayCardProps } from './components/AwayCard';
export { PeopleButton } from './components/PeopleButton';
export { PeoplePanel } from './components/PeoplePanel';
export { RingButton, type RingButtonProps } from './components/RingButton';
export { StatusDot } from './components/StatusDot';
export { StatusMenu } from './components/StatusMenu';
export { setPresenceStatus, usePresenceSession } from './hooks/usePresenceSession';
export { usePresenceActivity } from './hooks/usePresenceActivity';
export {
  presenceStore,
  usePresenceOf,
  usePresenceStore,
  type PresenceOf,
  type PresencePerson,
  type PresenceState,
} from './store/presence-store';
