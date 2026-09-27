import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useRouteError } from 'react-router';

import { reportError } from '@/shared/lib/sentry';
import { ErrorFallback } from '@/shared/ui';
import { useDocumentTitle } from '@/shared/lib/useDocumentTitle';

/** Error element of the router: loader/render errors inside routes end up here. */
export function RouteErrorPage() {
  const error = useRouteError();
  const { t } = useTranslation();
  useDocumentTitle(t('docTitle.error'));
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
