import type { RouteObject } from 'react-router';

import type { SpaceExtension } from '@/features/world';

import { DeskOverlay, MyDeskBarItem } from './components/PersonalizationSpaceItems';
import es from './i18n/es.json';

/**
 * Public API of the `personalization` feature (E9): Office style, my desk and desk decoration.
 * Other features and `app/` import ONLY from this file (standards §5).
 *
 * The office style is a space setting (the "Estilo" section lives in `spaces`); the world scene
 * draws styles, desk names and objects from the `officeStore` of `world`. This feature holds the
 * desk UI: the `X` menu, "Decorar", "Mi escritorio" and the desk column of "Miembros".
 */

/** Routes of the feature, mounted by `app/routes.tsx` inside the root layout. */
export const personalizationRoutes: RouteObject[] = [];

/** i18n namespace `personalization` (texts in `./i18n/es.json`). */
export const personalizationMessages = { es } as const;

/**
 * Desks in the office page (E9-S2, E9-S3): the `X` desk menu and "Decorar" over the map, and
 * "Mi escritorio" in the bottom bar. `app/` hands it to the world's `SpaceExtensionsProvider`.
 */
export const personalizationSpaceExtension: SpaceExtension = {
  id: 'personalization',
  Overlay: DeskOverlay,
  BarItems: MyDeskBarItem,
};

export { DeskHud, type DeskHudProps } from './components/DeskHud';
export { MemberDeskControls, type MemberDeskControlsProps } from './components/MemberDeskControls';
export { MyDeskButton, type MyDeskButtonProps } from './components/MyDeskButton';
export { useMapDeskIds } from './hooks/useDesks';
export { deskLink } from './hooks/useShowDeskFromUrl';
