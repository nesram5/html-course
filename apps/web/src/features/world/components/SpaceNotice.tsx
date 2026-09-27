import { WEB_PATHS } from '@plaza/shared';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';

import type { SpaceSessionState } from '../realtime/space-session';

/**
 * Errors that retrying cannot fix: not (or no longer) a member, or banned by an owner.
 * Plain strings so codes added to the shared catalog later (bans) need no change here.
 */
const FINAL_ERRORS: readonly string[] = ['NOT_A_MEMBER', 'FORBIDDEN', 'BANNED_FROM_SPACE'];

export function isFinalError(code: string | undefined): boolean {
  return code !== undefined && FINAL_ERRORS.includes(code);
}

export interface SpaceNoticeProps {
  readonly title: string;
  /** Explanation, announced as an alert. */
  readonly message: ReactNode;
  readonly actionLabel?: string;
  readonly onAction?: () => void;
}

/**
 * Full-page message instead of the office: the space could not be opened, the join was refused,
 * or Plaza is open in another tab. Always offers the way back to "Mis espacios".
 */
export function SpaceNotice({ title, message, actionLabel, onAction }: SpaceNoticeProps) {
  const { t } = useTranslation('world');
  return (
    <main className="mx-auto flex min-h-full max-w-lg flex-col justify-center gap-4 p-8 text-center">
      <h1 className="text-2xl font-semibold">{title}</h1>
      <p role="alert" className="text-slate-600">
        {message}
      </p>
      <div className="flex justify-center gap-3">
        {actionLabel !== undefined && onAction !== undefined && (
          <button
            type="button"
            className="rounded-md bg-brand-600 px-4 py-2 font-medium text-white hover:bg-brand-700"
            onClick={onAction}
          >
            {actionLabel}
          </button>
        )}
        <Link
          to={WEB_PATHS.spaces}
          className="rounded-md px-4 py-2 font-medium text-brand-700 hover:bg-brand-50"
        >
          {t('page.backToSpaces')}
        </Link>
      </div>
    </main>
  );
}

function reloadPage(): void {
  window.location.reload();
}

export interface SessionNoticeProps {
  readonly session: SpaceSessionState;
  /** Reconnect and join again. */
  readonly onRetry: () => void;
}

/**
 * What replaces the office when the realtime session cannot go on (E4-S1): Plaza opened in
 * another tab (`SESSION_REPLACED`, with "Usar Plaza aquí"), or a refused join (the error text,
 * with "Reintentar" or "Recargar" when that can help). `null` otherwise.
 */
export function SessionNotice({ session, onRetry }: SessionNoticeProps) {
  const { t } = useTranslation('world');
  const { t: tc } = useTranslation();

  if (session.kind === 'kicked' && session.reason === 'SESSION_REPLACED') {
    return (
      <SpaceNotice
        title={t('session.replacedTitle')}
        message={t('session.replacedBody')}
        actionLabel={t('session.takeOver')}
        onAction={onRetry}
      />
    );
  }
  if (session.kind !== 'failed') return null;

  const { code } = session;
  const reload = code === 'PROTOCOL_MISMATCH';
  return (
    <SpaceNotice
      title={t('page.errorTitle')}
      message={tc(`errors.${code}`)}
      {...(!isFinalError(code) && {
        actionLabel: reload ? t('page.reload') : t('page.retry'),
        onAction: reload ? reloadPage : onRetry,
      })}
    />
  );
}
