import type { QueryClient } from '@tanstack/react-query';
import type { i18n } from 'i18next';
import { RouterProvider, type createBrowserRouter } from 'react-router';

import { AppProviders } from './providers';

export type AppRouter = ReturnType<typeof createBrowserRouter>;

interface AppProps {
  router: AppRouter;
  i18n: i18n;
  queryClient: QueryClient;
}

export function App({ router, i18n, queryClient }: AppProps) {
  return (
    <AppProviders i18n={i18n} queryClient={queryClient}>
      <RouterProvider router={router} />
    </AppProviders>
  );
}
