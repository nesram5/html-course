import { useEffect } from 'react';
import { useRouteError } from 'react-router';

import { reportError } from '@/shared/lib/sentry';
import { ErrorFallback } from '@/shared/ui';

/** Error element of the router: loader/render errors inside routes end up here. */
export function RouteErrorPage() {
  const error = useRouteError();
  useEffect(() => {
    reportError(error);
  }, [error]);
  return (
    <ErrorFallback
      onRetry={() => {
        window.location.reload();
      }}
    />
  );
}
