import { WEB_PATHS } from '@plaza/shared';
import { createElement } from 'react';
import type { RouteObject } from 'react-router';

import { RequireAuth } from '@/features/auth';
import type { SpaceExtension } from '@/features/world';

import { OfficeTelemetryProbe } from './components/OfficeTelemetryProbe';
import es from './i18n/es.json';
import { AdminMetricsPage } from './pages/AdminMetricsPage';
import { FeedbackPage } from './pages/FeedbackPage';

/**
 * Public API of the `product` feature (E8-S7): in-app feedback, client telemetry of the office
 * (O3, O4, O5) and the O1–O6 metrics page of the product team.
 * Other features and `app/` import ONLY from this file (standards §5).
 */

/** Routes of the feature, mounted by `app/routes.tsx` inside the root layout. */
export const productRoutes: RouteObject[] = [
  {
    element: createElement(RequireAuth),
    children: [
      { path: WEB_PATHS.feedback, element: createElement(FeedbackPage) },
      { path: WEB_PATHS.adminMetrics, element: createElement(AdminMetricsPage) },
    ],
  },
];

/** i18n namespace `product` (texts in `./i18n/es.json`). */
export const productMessages = { es } as const;

/**
 * Measures each visit of the office (no UI). `app/` hands it to the world's
 * `SpaceExtensionsProvider`.
 */
export const productSpaceExtension: SpaceExtension = {
  id: 'product',
  Overlay: OfficeTelemetryProbe,
};

export { TelemetryClient, telemetry } from './lib/telemetry';
