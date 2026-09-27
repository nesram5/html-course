import { WEB_PATHS } from '@bululu/shared';
import { useId, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { useDocumentTitle } from '@/shared/lib/useDocumentTitle';

const STORED = ['profile', 'spaces', 'chat', 'feedback', 'events', 'session'] as const;
const NOT_STORED = ['media', 'positions', 'googleTokens'] as const;

function Section({ title, children }: { readonly title: string; readonly children: ReactNode }) {
  const id = useId();
  return (
    <section aria-labelledby={id} className="flex flex-col gap-2">
      <h2 id={id} className="text-xl font-semibold">
        {title}
      </h2>
      {children}
    </section>
  );
}

/**
 * `/privacidad` (E8-S6, RNF-06): what Bululu stores (basic Google profile, chat, product events
 * without personal data) and what it never stores (audio, video, positions, Google tokens), and
 * that meeting rooms use Google Meet. Public: linked from the login page and the footer.
 */
export function PrivacyPage() {
  const { t } = useTranslation();
  useDocumentTitle(t('docTitle.privacy'));

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 p-8">
      <Link to="/" className="text-sm text-brand-700 underline">
        {t('privacy.back')}
      </Link>
      <h1 className="text-3xl font-bold">{t('privacy.title')}</h1>
      <p className="text-slate-700">{t('privacy.intro')}</p>

      <Section title={t('privacy.stored.title')}>
        <ul className="list-disc space-y-1 pl-6 text-slate-700">
          {STORED.map((key) => (
            <li key={key}>{t(`privacy.stored.${key}`)}</li>
          ))}
        </ul>
      </Section>

      <Section title={t('privacy.notStored.title')}>
        <ul className="list-disc space-y-1 pl-6 text-slate-700">
          {NOT_STORED.map((key) => (
            <li key={key}>{t(`privacy.notStored.${key}`)}</li>
          ))}
        </ul>
        <p className="text-slate-700">{t('privacy.notStored.browser')}</p>
      </Section>

      <Section title={t('privacy.meet.title')}>
        <p className="text-slate-700">{t('privacy.meet.text')}</p>
      </Section>

      <Section title={t('privacy.hallway.title')}>
        <p className="text-slate-700">{t('privacy.hallway.text')}</p>
      </Section>

      <Section title={t('privacy.rights.title')}>
        <p className="text-slate-700">{t('privacy.rights.text')}</p>
        <p className="flex flex-wrap gap-4">
          <Link to={WEB_PATHS.profile} className="text-brand-700 underline">
            {t('privacy.rights.profile')}
          </Link>
          <Link to={WEB_PATHS.feedback} className="text-brand-700 underline">
            {t('privacy.rights.feedback')}
          </Link>
        </p>
      </Section>
    </main>
  );
}
