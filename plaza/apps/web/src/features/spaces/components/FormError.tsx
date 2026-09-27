import { useTranslation } from 'react-i18next';

import { errorMessageKey } from '@/shared/api';

/** Translated error of a failed mutation, next to the form that sent it. */
export function FormError({ error }: { error: unknown }) {
  const { t } = useTranslation();
  if (error === null || error === undefined) return null;
  return (
    <p role="alert" className="text-sm text-red-700">
      {t(errorMessageKey(error))}
    </p>
  );
}
