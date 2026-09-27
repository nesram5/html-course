import { useTranslation } from 'react-i18next';

import { toast } from '@/shared/ui';

import { DeleteAccountSection } from '../components/DeleteAccountSection';
import { PageLoading } from '../components/RequireAuth';
import { ProfileForm } from '../components/ProfileForm';
import { UserMenu } from '../components/UserMenu';
import { useSession } from '../hooks/useSession';

/** `/profile`: display name and avatar (E1-S4), "Borrar mi cuenta" (E8-S6). Inside `RequireAuth`. */
export function ProfilePage() {
  const { t } = useTranslation('auth');
  const session = useSession();

  return (
    <>
      <UserMenu />
      {session.status !== 'authenticated' ? (
        <PageLoading />
      ) : (
        <main className="mx-auto flex max-w-2xl flex-col gap-6 p-8">
          <div className="flex items-center gap-4">
            {session.user.pictureUrl !== null && (
              <img
                src={session.user.pictureUrl}
                alt=""
                referrerPolicy="no-referrer"
                className="h-14 w-14 rounded-full"
              />
            )}
            <div>
              <h1 className="text-2xl font-semibold">{t('profile.title')}</h1>
              <p className="text-slate-600">{t('profile.subtitle')}</p>
            </div>
          </div>
          <p className="text-sm text-slate-600">
            {t('profile.email')}: <span className="font-medium">{session.user.email}</span>
          </p>
          <ProfileForm
            user={session.user}
            submitLabel={t('profile.save')}
            onSaved={() => toast.success(t('profile.saved'))}
          />
          <DeleteAccountSection />
        </main>
      )}
    </>
  );
}
