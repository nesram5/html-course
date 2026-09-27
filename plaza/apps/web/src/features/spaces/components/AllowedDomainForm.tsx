import { useId, useState, type SyntheticEvent } from 'react';
import { useTranslation } from 'react-i18next';

import { toast } from '@/shared/ui';

import { useUpdateSpace } from '../hooks/useSpaces';
import { FormError } from './FormError';

interface AllowedDomainFormProps {
  spaceId: string;
  allowedDomain: string | null;
}

/** Owner setting: verified e-mails of this domain join without invitation (E2-S4). */
export function AllowedDomainForm({ spaceId, allowedDomain }: AllowedDomainFormProps) {
  const { t } = useTranslation('spaces');
  const inputId = useId();
  const [domain, setDomain] = useState(allowedDomain ?? '');
  const update = useUpdateSpace(spaceId);

  const save = (event: SyntheticEvent) => {
    event.preventDefault();
    const value = domain.trim();
    update.mutate(
      { allowedDomain: value === '' ? null : value },
      { onSuccess: () => toast.success(t(value === '' ? 'domain.cleared' : 'domain.saved')) },
    );
  };

  return (
    <section aria-labelledby={`${inputId}-title`} className="flex flex-col gap-3">
      <h2 id={`${inputId}-title`} className="text-lg font-semibold">
        {t('domain.title')}
      </h2>
      <p className="text-sm text-slate-600">{t('domain.description')}</p>
      <form onSubmit={save} className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <label htmlFor={inputId} className="text-sm font-medium">
            {t('domain.label')}
          </label>
          <input
            id={inputId}
            value={domain}
            placeholder={t('domain.placeholder')}
            onChange={(event) => {
              setDomain(event.target.value);
            }}
            className="rounded-md border border-slate-300 px-3 py-2"
          />
        </div>
        <button
          type="submit"
          disabled={update.isPending}
          className="rounded-md bg-brand-600 px-3 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
        >
          {t('domain.save')}
        </button>
        {allowedDomain !== null && (
          <button
            type="button"
            disabled={update.isPending}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm"
            onClick={() => {
              setDomain('');
              update.mutate(
                { allowedDomain: null },
                { onSuccess: () => toast.success(t('domain.cleared')) },
              );
            }}
          >
            {t('domain.clear')}
          </button>
        )}
      </form>
      <FormError error={update.error} />
    </section>
  );
}
