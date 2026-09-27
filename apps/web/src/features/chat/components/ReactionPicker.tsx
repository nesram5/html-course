import { REACTION_EMOJIS, type ReactionEmoji } from '@bululu/shared';
import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';

import { sendReaction } from '../hooks/useChatSession';
import { useReactionKeys } from '../hooks/useReactionKeys';

const NAMES = {
  '❤️': 'heart',
  '👍': 'thumbsUp',
  '🎉': 'party',
  '😂': 'laugh',
  '👋': 'wave',
} as const satisfies Record<ReactionEmoji, string>;

export interface ReactionPickerProps {
  readonly react?: (emoji: ReactionEmoji) => void;
}

const defaultReact = (emoji: ReactionEmoji) => {
  sendReaction(emoji);
};

/**
 * Emoji button of the bottom bar (E7-S4): ❤️ 👍 🎉 😂 👋 over my avatar for 3 s, for everyone.
 * The keys `1`–`5` react without opening it.
 */
export function ReactionPicker({ react = defaultReact }: ReactionPickerProps) {
  const { t } = useTranslation('chat');
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const itemsRef = useRef<(HTMLButtonElement | null)[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);
  useReactionKeys(react);

  useEffect(() => {
    if (!open) return undefined;
    itemsRef.current[0]?.focus();
    const onPointerDown = (event: PointerEvent) => {
      if (
        !(event.target instanceof Node) ||
        containerRef.current?.contains(event.target) !== true
      ) {
        setOpen(false);
      }
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
    };
  }, [open]);

  // Toolbar pattern: one Tab stop, arrows (and Home / End) move between the emojis.
  const onMenuKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      setOpen(false);
      buttonRef.current?.focus();
      return;
    }
    const count = REACTION_EMOJIS.length;
    const current = itemsRef.current.findIndex((item) => item === document.activeElement);
    let next: number | null = null;
    if (event.key === 'ArrowRight') next = (current + 1) % count;
    else if (event.key === 'ArrowLeft') next = (current - 1 + count) % count;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = count - 1;
    if (next === null) return;
    event.preventDefault();
    itemsRef.current[next]?.focus();
  };

  return (
    <div
      ref={containerRef}
      className="relative"
      // Tab out of the picker closes it, like a click outside.
      onBlur={(event) => {
        if (open && !event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
    >
      <button
        ref={buttonRef}
        type="button"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={t('reactions.button')}
        className="rounded-md px-2 py-1.5 text-lg leading-none hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
        onClick={() => {
          setOpen((value) => !value);
        }}
      >
        <span aria-hidden="true">😀</span>
      </button>
      {open && (
        <div
          id={menuId}
          role="toolbar"
          aria-label={t('reactions.menu')}
          onKeyDown={onMenuKeyDown}
          className="absolute bottom-full left-1/2 mb-2 flex -translate-x-1/2 gap-1 rounded-full bg-white p-1 shadow-lg"
        >
          {REACTION_EMOJIS.map((emoji, index) => (
            <button
              key={emoji}
              ref={(element) => {
                itemsRef.current[index] = element;
              }}
              type="button"
              tabIndex={index === 0 ? 0 : -1}
              aria-label={t('reactions.item', {
                name: t(`reactions.names.${NAMES[emoji]}`),
                key: index + 1,
              })}
              className="rounded-full px-2 py-1 text-xl leading-none hover:bg-slate-100"
              onClick={() => {
                react(emoji);
              }}
            >
              <span aria-hidden="true">{emoji}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
