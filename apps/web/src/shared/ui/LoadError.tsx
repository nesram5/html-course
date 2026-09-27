import { useTranslation } from 'react-i18next';

import { errorMessageKey } from '@/shared/api';

export interface LoadErrorProps {
  /** The failed request's error: its message comes from `errors.<code>`. */
  readonly error: unknown;
  /** Asks again (`query.refetch`). */
  readonly onRetry: () => void;
  /** Translated text instead of the error's own message. */
  readonly message?: string;
}

/** A failed load, said as such (not as an empty list) with "Reintentar". */
export function LoadError({ error, onRetry, message }: LoadErrorProps) {
  const { t } = useTranslation();
  return (
    <div role="alert" className="flex flex-wrap items-center gap-3 text-sm text-red-700">
      <p>{message ?? t(errorMessageKey(error))}</p>
      <button
        type="button"
        className="rounded-md border border-slate-300 px-3 py-1 text-slate-800 hover:bg-slate-50"
        onClick={onRetry}
      >
        {t('errorBoundary.retry')}
      </button>
    </div>
  );
}
