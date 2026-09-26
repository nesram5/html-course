import { MutationCache, QueryClient } from '@tanstack/react-query';
import type { i18n } from 'i18next';

import { errorMessageKey, isApiError } from '@/shared/api';
import { toast } from '@/shared/ui';

/**
 * TanStack Query client. Client errors (4xx) are not retried; failed mutations show a toast
 * with the translated error code unless the mutation sets `meta: { silent: true }`.
 */
export function createQueryClient(i18n: i18n): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        retry: (failureCount, error) =>
          !(isApiError(error) && error.status >= 400 && error.status < 500) && failureCount < 2,
      },
    },
    mutationCache: new MutationCache({
      onError: (error, _variables, _context, mutation) => {
        if (mutation.meta?.silent === true) return;
        toast.error(i18n.t(errorMessageKey(error)));
      },
    }),
  });
}
