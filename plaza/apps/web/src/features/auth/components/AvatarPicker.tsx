import { useTranslation } from 'react-i18next';

import { useAvatars } from '../hooks/useSession';
import { AvatarSprite } from './AvatarSprite';

interface AvatarPickerProps {
  value: string | null;
  onChange: (avatarId: string) => void;
}

/** Grid of the avatar catalog with their walking animation (E1-S4). */
export function AvatarPicker({ value, onChange }: AvatarPickerProps) {
  const { t } = useTranslation('auth');
  const avatars = useAvatars();

  if (avatars.isPending) return <p className="text-slate-600">{t('loading')}</p>;
  if (avatars.isError) return <p role="alert">{t('avatarPicker.loadError')}</p>;
  if (avatars.data.length === 0) {
    return <p className="text-slate-600">{t('avatarPicker.empty')}</p>;
  }

  return (
    <div
      role="radiogroup"
      aria-label={t('avatarPicker.label')}
      className="grid grid-cols-4 gap-3 sm:grid-cols-6"
    >
      {avatars.data.map((avatar) => {
        const selected = avatar.id === value;
        return (
          <button
            key={avatar.id}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={avatar.name}
            onClick={() => {
              onChange(avatar.id);
            }}
            className={`flex flex-col items-center gap-1 rounded-lg border-2 p-2 text-xs ${
              selected
                ? 'border-brand-600 bg-brand-50'
                : 'border-transparent bg-white hover:border-slate-300'
            }`}
          >
            <AvatarSprite avatar={avatar} />
            <span className="truncate">{avatar.name}</span>
          </button>
        );
      })}
    </div>
  );
}
