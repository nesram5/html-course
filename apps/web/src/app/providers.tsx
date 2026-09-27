import { QueryClientProvider, type QueryClient } from '@tanstack/react-query';
import type { i18n } from 'i18next';
import type { ReactNode } from 'react';
import { I18nextProvider } from 'react-i18next';

import { ErrorBoundary, ErrorFallback, Toaster } from '@/shared/ui';

interface AppProvidersProps {
  children: ReactNode;
  i18n: i18n;
  queryClient: QueryClient;
}

/** Global providers: i18n, server state (TanStack Query), error boundary and toasts. */
export function AppProviders({ children, i18n, queryClient }: AppProvidersProps) {
  return (
    <I18nextProvider i18n={i18n}>
      <QueryClientProvider client={queryClient}>
        <ErrorBoundary fallback={(reset) => <ErrorFallback onRetry={reset} />}>
          {children}
        </ErrorBoundary>
        <Toaster />
      </QueryClientProvider>
    </I18nextProvider>
  );
}
