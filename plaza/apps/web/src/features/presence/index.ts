import type { RouteObject } from 'react-router';

import es from './i18n/es.json';

/**
 * Public API of the `presence` feature (E7): Status, away detection, member list, locate and ring.
 * Other features and `app/` import ONLY from this file (standards §5).
 *
 * Nothing here may use another feature at module load time (only inside functions): `world`
 * imports this feature for its space page, and this feature imports `world`.
 */

/** Routes of the feature, mounted by `app/routes.tsx` inside the root layout. */
export const presenceRoutes: RouteObject[] = [];

/** i18n namespace `presence` (texts in `./i18n/es.json`). */
export const presenceMessages = { es } as const;

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
