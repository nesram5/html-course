import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { useAvatars, useSession } from '../hooks/useSession';
import { ProfileForm } from './ProfileForm';
import { PageLoading } from './RequireAuth';

/**
 * First time in a space without a chosen avatar (E1-S4): shows the avatar picker before the
 * children (the map). Use inside `RequireAuth`. If the catalog is empty there is nothing to
 * choose and the children are shown.
 */
export function RequireAvatar({ children }: { children: ReactNode }) {
  const { t } = useTranslation('auth');
  const session = useSession();
  const avatars = useAvatars();

  if (session.status === 'loading' || (session.user?.avatarChosen === false && avatars.isPending)) {
    return <PageLoading />;
  }
  const catalogEmpty = avatars.isSuccess && avatars.data.length === 0;
  if (session.status !== 'authenticated' || session.user.avatarChosen || catalogEmpty) {
    return children;
  }

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-4 p-8">
      <h1 className="text-2xl font-semibold">{t('avatarPrompt.title')}</h1>
      <p className="text-slate-600">{t('avatarPrompt.description')}</p>
      <ProfileForm
        user={session.user}
        submitLabel={t('avatarPrompt.continue')}
        requireAvatarChoice
      />
    </main>
  );
}
