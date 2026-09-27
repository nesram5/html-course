import type { QueryClient } from '@tanstack/react-query';
import type { i18n } from 'i18next';
import { RouterProvider, type createBrowserRouter } from 'react-router';

import { SpaceSettingsExtensionsProvider } from '@/features/spaces';
import { SpaceExtensionsProvider, type SpaceExtension } from '@/features/world';

import { AppProviders } from './providers';
import { spaceExtensions as defaultSpaceExtensions } from './space-extensions';
import { spaceSettingsExtensions } from './space-settings-extensions';

export type AppRouter = ReturnType<typeof createBrowserRouter>;

interface AppProps {
  router: AppRouter;
  i18n: i18n;
  queryClient: QueryClient;
  /** Features that extend the office page; `app/space-extensions.ts` by default. */
  spaceExtensions?: readonly SpaceExtension[];
}

export function App({
  router,
  i18n,
  queryClient,
  spaceExtensions = defaultSpaceExtensions,
}: AppProps) {
  return (
    <AppProviders i18n={i18n} queryClient={queryClient}>
      <SpaceExtensionsProvider extensions={spaceExtensions}>
        <SpaceSettingsExtensionsProvider extensions={spaceSettingsExtensions}>
          <RouterProvider router={router} />
        </SpaceSettingsExtensionsProvider>
      </SpaceExtensionsProvider>
    </AppProviders>
  );
}
