import { useRef, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';

import { useAvatars } from '../hooks/useSession';
import { AvatarSprite } from './AvatarSprite';

interface AvatarPickerProps {
  value: string | null;
  onChange: (avatarId: string) => void;
}

/** Arrow keys of the radio pattern: previous or next avatar (wrapping), Home and End. */
const STEPS: Readonly<Record<string, number>> = {
  ArrowRight: 1,
  ArrowDown: 1,
  ArrowLeft: -1,
  ArrowUp: -1,
};

/**
 * Grid of the avatar catalog with their walking animation (E1-S4). A radio group: one Tab stop
 * (the chosen avatar, or the first), and the arrow keys choose the previous or next one.
 */
export function AvatarPicker({ value, onChange }: AvatarPickerProps) {
  const { t } = useTranslation('auth');
  const avatars = useAvatars();
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);

  if (avatars.isPending) return <p className="text-slate-600">{t('loading')}</p>;
  if (avatars.isError) return <p role="alert">{t('avatarPicker.loadError')}</p>;
  if (avatars.data.length === 0) {
    return <p className="text-slate-600">{t('avatarPicker.empty')}</p>;
  }

  const list = avatars.data;
  const checkedIndex = list.findIndex((avatar) => avatar.id === value);
  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    const current = buttons.current.findIndex((button) => button === document.activeElement);
    if (current === -1) return;
    let next: number;
    if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = list.length - 1;
    else if (STEPS[event.key] !== undefined) {
      next = (current + (STEPS[event.key] ?? 0) + list.length) % list.length;
    } else return;
    event.preventDefault();
    const avatar = list[next];
    if (avatar === undefined) return;
    onChange(avatar.id);
    buttons.current[next]?.focus();
  };

  return (
    <div
      role="radiogroup"
      aria-label={t('avatarPicker.label')}
      className="grid grid-cols-4 gap-3 sm:grid-cols-6"
    >
      {list.map((avatar, index) => {
        const selected = avatar.id === value;
        const tabStop = checkedIndex === -1 ? index === 0 : selected;
        return (
          <button
            key={avatar.id}
            ref={(element) => {
              buttons.current[index] = element;
            }}
            type="button"
            role="radio"
            aria-checked={selected}
            tabIndex={tabStop ? 0 : -1}
            onKeyDown={onKeyDown}
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
