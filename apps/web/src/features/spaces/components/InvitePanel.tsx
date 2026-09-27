import { useId } from 'react';
import { useTranslation } from 'react-i18next';

import { errorMessageKey } from '@/shared/api';
import { toast } from '@/shared/ui';

import { useRegenerateInvite } from '../hooks/useSpaces';
import { ConfirmAction } from './ConfirmAction';

/** Owner panel: copy the `/join/<token>` link or regenerate it (E2-S4). */
export function InvitePanel({ spaceId, inviteUrl }: { spaceId: string; inviteUrl: string }) {
  const { t } = useTranslation('spaces');
  const { t: tc } = useTranslation();
  const inputId = useId();
  const regenerate = useRegenerateInvite(spaceId);

  const copy = () => {
    navigator.clipboard.writeText(inviteUrl).then(
      () => toast.success(t('invite.copied')),
      (error: unknown) => toast.error(tc(errorMessageKey(error))),
    );
  };

  return (
    <section aria-labelledby={`${inputId}-title`} className="flex flex-col gap-3">
      <h2 id={`${inputId}-title`} className="text-lg font-semibold">
        {t('invite.title')}
      </h2>
      <p className="text-sm text-slate-600">{t('invite.description')}</p>
      <label htmlFor={inputId} className="sr-only">
        {t('invite.label')}
      </label>
      <input
        id={inputId}
        readOnly
        value={inviteUrl}
        onFocus={(event) => {
          event.target.select();
        }}
        className="rounded-md border border-slate-300 bg-slate-50 px-3 py-2 font-mono text-sm"
      />
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={copy}
          className="rounded-md bg-brand-600 px-3 py-1 text-sm font-medium text-white hover:bg-brand-700"
        >
          {t('invite.copy')}
        </button>
        <ConfirmAction
          label={t('invite.regenerate')}
          question={t('invite.regenerateConfirm')}
          disabled={regenerate.isPending}
          onConfirm={() => {
            regenerate.mutate(undefined, {
              onSuccess: () => toast.success(t('invite.regenerated')),
            });
          }}
        />
      </div>
    </section>
  );
}
