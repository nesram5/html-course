import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { useDocumentTitle } from '@/shared/lib/useDocumentTitle';

export function NotFoundPage() {
  const { t } = useTranslation();
  useDocumentTitle(t('docTitle.notFound'));
  return (
    <main className="mx-auto flex max-w-lg flex-col items-center gap-4 p-8 text-center">
      <p className="text-6xl font-bold text-brand-600" aria-hidden="true">
        404
      </p>
      <h1 className="text-2xl font-semibold">{t('notFound.title')}</h1>
      <p className="text-slate-600">{t('notFound.description')}</p>
      <Link to="/" className="font-medium text-brand-700 underline hover:text-brand-600">
        {t('notFound.backHome')}
      </Link>
    </main>
  );
}
