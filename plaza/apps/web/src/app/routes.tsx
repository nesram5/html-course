import type { RouteObject } from 'react-router';

import { authRoutes } from '@/features/auth';
import { chatRoutes } from '@/features/chat';
import { mediaRoutes } from '@/features/media';
import { personalizationRoutes } from '@/features/personalization';
import { presenceRoutes } from '@/features/presence';
import { roomsRoutes } from '@/features/rooms';
import { spacesRoutes } from '@/features/spaces';
import { worldRoutes } from '@/features/world';

import { RootLayout } from './RootLayout';
import { HomePage } from './pages/HomePage';
import { NotFoundPage } from './pages/NotFoundPage';
import { RouteErrorPage } from './pages/RouteErrorPage';

/**
 * Route table. Features add their routes in their own `index.ts` (`<feature>Routes`), so this
 * file does not change when a feature grows.
 */
export const routes: RouteObject[] = [
  {
    element: <RootLayout />,
    errorElement: <RouteErrorPage />,
    children: [
      { index: true, element: <HomePage /> },
      ...authRoutes,
      ...spacesRoutes,
      ...worldRoutes,
      ...mediaRoutes,
      ...roomsRoutes,
      ...presenceRoutes,
      ...chatRoutes,
      ...personalizationRoutes,
      { path: '*', element: <NotFoundPage /> },
    ],
  },
];
