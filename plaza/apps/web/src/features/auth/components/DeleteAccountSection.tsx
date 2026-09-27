import { apiPath, WEB_PATHS, type AccountDeletionPreview } from '@plaza/shared';
import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router';

import { errorMessageKey, isApiError } from '@/shared/api';
import { toast, useDialog } from '@/shared/ui';

import { useDeleteAccount, useDeletionPreview } from '../hooks/useSession';

const DANGER =
  'rounded-md bg-red-700 px-4 py-2 font-medium text-white hover:bg-red-800 disabled:opacity-50';
const SECONDARY = 'rounded-md border border-slate-300 px-4 py-2 font-medium hover:bg-slate-50';

/**
 * "Borrar mi cuenta" in the profile (E8-S6, RNF-06): what is deleted, what blocks it (being the
 * only owner of a space with other members) and a confirmation dialog.
 */
export function DeleteAccountSection() {
  const { t } = useTranslation('auth');
  const titleId = useId();
  const preview = useDeletionPreview();
  const [confirming, setConfirming] = useState(false);
  const blocking = preview.data?.blockingSpaces ?? [];

  return (
    <section
      aria-labelledby={titleId}
      className="flex flex-col gap-3 rounded-lg border border-red-200 p-4"
    >
      <h2 id={titleId} className="text-lg font-semibold text-red-800">
        {t('deleteAccount.title')}
      </h2>
      <p className="text-sm text-slate-700">{t('deleteAccount.what')}</p>
      <p className="text-sm text-slate-700">
        {t('deleteAccount.privacy')}{' '}
        <Link to={WEB_PATHS.privacy} className="text-brand-700 underline">
          {t('deleteAccount.privacyLink')}
        </Link>
      </p>
      {blocking.length > 0 && (
        <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm" role="note">
          <p className="font-medium">{t('deleteAccount.blocked', { count: blocking.length })}</p>
          <ul className="mt-1 list-disc pl-5">
            {blocking.map((space) => (
              <li key={space.id}>
                <Link
                  to={apiPath(WEB_PATHS.spaceSettings, { spaceId: space.id })}
                  className="text-brand-700 underline"
                >
                  {t('deleteAccount.blockedSpace', { name: space.name })}
                </Link>
              </li>
            ))}
          </ul>
          <p className="mt-1">{t('deleteAccount.blockedHint')}</p>
        </div>
      )}
      <button
        type="button"
        className={`self-start ${DANGER}`}
        disabled={preview.isPending || blocking.length > 0}
        onClick={() => {
          setConfirming(true);
        }}
      >
        {t('deleteAccount.open')}
      </button>
      {preview.isError && (
        <p role="alert" className="text-sm text-red-700">
          {t('deleteAccount.previewFailed')}
        </p>
      )}
      {confirming && preview.data !== undefined && (
        <ConfirmDeleteDialog
          preview={preview.data}
          onClose={() => {
            setConfirming(false);
            void preview.refetch();
          }}
        />
      )}
    </section>
  );
}

function ConfirmDeleteDialog({
  preview,
  onClose,
}: {
  readonly preview: AccountDeletionPreview;
  readonly onClose: () => void;
}) {
  const { t } = useTranslation('auth');
  const { t: tc } = useTranslation();
  const titleId = useId();
  const descriptionId = useId();
  const dialogRef = useDialog<HTMLDivElement>(onClose);
  const remove = useDeleteAccount();
  const navigate = useNavigate();
  const error = remove.error;

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-900/60 p-4">
      <div
        ref={dialogRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        className="flex w-full max-w-md flex-col gap-3 rounded-xl bg-white p-6 text-slate-900 shadow-xl"
      >
        <h2 id={titleId} className="text-xl font-semibold">
          {t('deleteAccount.confirmTitle')}
        </h2>
        <div id={descriptionId} className="flex flex-col gap-2 text-sm text-slate-700">
          <p>{t('deleteAccount.confirmText')}</p>
          {preview.spacesDeleted.length > 0 && (
            <>
              <p>{t('deleteAccount.spacesDeleted', { count: preview.spacesDeleted.length })}</p>
              <ul className="list-disc pl-5">
                {preview.spacesDeleted.map((space) => (
                  <li key={space.id}>{space.name}</li>
                ))}
              </ul>
            </>
          )}
        </div>
        {error !== null && (
          <p role="alert" className="text-sm text-red-700">
            {isApiError(error) && error.code === 'SOLE_OWNER'
              ? t('deleteAccount.soleOwner')
              : tc(errorMessageKey(error))}
          </p>
        )}
        <div className="flex flex-wrap justify-end gap-2">
          <button type="button" className={SECONDARY} data-autofocus onClick={onClose}>
            {t('deleteAccount.cancel')}
          </button>
          <button
            type="button"
            className={DANGER}
            disabled={remove.isPending}
            onClick={() => {
              remove.mutate(undefined, {
                onSuccess: () => {
                  toast.success(t('deleteAccount.done'));
                  void navigate(WEB_PATHS.login, { replace: true });
                },
              });
            }}
          >
            {remove.isPending ? t('deleteAccount.deleting') : t('deleteAccount.confirm')}
          </button>
        </div>
      </div>
    </div>
  );
}
