import { DISPLAY_NAME_MAX_LEN, type Me, type UpdateMeBody } from '@bululu/shared';
import { useId, useState, type SyntheticEvent } from 'react';
import { useTranslation } from 'react-i18next';

import { errorMessageKey } from '@/shared/api';

import { useUpdateMe } from '../hooks/useSession';
import { AvatarPicker } from './AvatarPicker';

interface ProfileFormProps {
  user: Me;
  submitLabel: string;
  /** First-time prompt: an avatar must be picked explicitly. */
  requireAvatarChoice?: boolean;
  onSaved?: (user: Me) => void;
}

/** Display name + avatar picker, saved with `PATCH /api/me` (E1-S4). */
export function ProfileForm({ user, submitLabel, requireAvatarChoice, onSaved }: ProfileFormProps) {
  const { t } = useTranslation('auth');
  const { t: tc } = useTranslation();
  const nameId = useId();
  const [displayName, setDisplayName] = useState(user.displayName);
  const [avatarId, setAvatarId] = useState<string | null>(
    requireAvatarChoice === true && !user.avatarChosen ? null : user.avatarId,
  );
  const update = useUpdateMe();
  const mustChoose = requireAvatarChoice === true && avatarId === null;

  const submit = (event: SyntheticEvent) => {
    event.preventDefault();
    if (mustChoose) return;
    const body: UpdateMeBody = { displayName: displayName.trim() };
    if (avatarId !== null && (avatarId !== user.avatarId || !user.avatarChosen)) {
      body.avatarId = avatarId;
    }
    update.mutate(body, { onSuccess: (saved) => onSaved?.(saved) });
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <label htmlFor={nameId} className="font-medium">
          {t('profile.displayName')}
        </label>
        <input
          id={nameId}
          required
          maxLength={DISPLAY_NAME_MAX_LEN}
          value={displayName}
          onChange={(event) => {
            setDisplayName(event.target.value);
          }}
          className="rounded-md border border-slate-300 px-3 py-2"
        />
      </div>
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 font-medium">{t('avatarPicker.label')}</legend>
        <AvatarPicker value={avatarId} onChange={setAvatarId} />
      </fieldset>
      {mustChoose && <p className="text-sm text-slate-600">{t('avatarPrompt.chooseFirst')}</p>}
      {update.isError && (
        <p role="alert" className="text-sm text-red-700">
          {tc(errorMessageKey(update.error))}
        </p>
      )}
      <button
        type="submit"
        disabled={update.isPending || mustChoose || displayName.trim() === ''}
        className="self-start rounded-md bg-brand-600 px-4 py-2 font-medium text-white hover:bg-brand-700 disabled:opacity-50"
      >
        {update.isPending ? t('profile.saving') : submitLabel}
      </button>
    </form>
  );
}
