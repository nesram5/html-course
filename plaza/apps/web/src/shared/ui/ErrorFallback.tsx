import { useTranslation } from 'react-i18next';

/** Generic "something failed" screen with a retry button. */
export function ErrorFallback({ onRetry }: { onRetry: () => void }) {
  const { t } = useTranslation();
  return (
    <main className="mx-auto flex max-w-lg flex-col items-center gap-4 p-8 text-center">
      <h1 className="text-2xl font-semibold">{t('errorBoundary.title')}</h1>
      <p className="text-slate-600">{t('errorBoundary.description')}</p>
      <button
        type="button"
        className="rounded-md bg-brand-600 px-4 py-2 font-medium text-white hover:bg-brand-700"
        onClick={onRetry}
      >
        {t('errorBoundary.retry')}
      </button>
    </main>
  );
}
