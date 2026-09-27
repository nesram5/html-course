import { useId } from 'react';
import { useTranslation } from 'react-i18next';

import { AvatarSprite, useAvatars } from '@/features/auth';
import { toast } from '@/shared/ui';

import { useBans, useUnbanMember } from '../hooks/useSpaces';

const DATE_FORMAT = new Intl.DateTimeFormat('es', { dateStyle: 'medium' });

/**
 * Owner panel with the people removed from the space (E2-S6 follow-up): they cannot come back
 * with the invite link or the allowed domain until an owner clicks "Readmitir". Hidden when
 * nobody was removed.
 */
export function BansPanel({ spaceId }: { spaceId: string }) {
  const { t } = useTranslation('spaces');
  const titleId = useId();
  const bans = useBans(spaceId);
  const avatars = useAvatars();
  const unban = useUnbanMember(spaceId);
  const avatarById = new Map((avatars.data ?? []).map((avatar) => [avatar.id, avatar]));

  if (bans.data === undefined || bans.data.length === 0) return null;

  return (
    <section aria-labelledby={titleId} className="flex flex-col gap-3">
      <h2 id={titleId} className="text-lg font-semibold">
        {t('bans.title')}
      </h2>
      <p className="text-sm text-slate-600">{t('bans.description')}</p>
      <ul className="flex flex-col divide-y divide-slate-200 text-sm">
        {bans.data.map((ban) => {
          const avatar = avatarById.get(ban.avatarId);
          return (
            <li key={ban.userId} className="flex items-center gap-3 py-2">
              {avatar !== undefined && <AvatarSprite avatar={avatar} scale={1} walking={false} />}
              <div className="flex flex-1 flex-col">
                <span>{ban.displayName}</span>
                <span className="text-slate-500">
                  {ban.email} ·{' '}
                  {t('bans.since', { date: DATE_FORMAT.format(new Date(ban.createdAt)) })}
                </span>
              </div>
              <button
                type="button"
                className="rounded-md border border-slate-300 px-3 py-1 hover:bg-slate-50 disabled:opacity-50"
                aria-label={t('bans.unbanLabel', { name: ban.displayName })}
                disabled={unban.isPending}
                onClick={() => {
                  unban.mutate(ban.userId, {
                    onSuccess: () => toast.success(t('bans.unbanned', { name: ban.displayName })),
                  });
                }}
              >
                {t('bans.unban')}
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
