import { REACTION_EMOJIS, type ReactionEmoji } from '@plaza/shared';
import { useEffect, useRef } from 'react';

import { isTypingTarget } from '@/features/world';

/** The reaction of a key: `1`..`5` (top row or keypad) in `REACTION_EMOJIS` order. */
export function reactionOfKey(event: Pick<KeyboardEvent, 'key' | 'code'>): ReactionEmoji | null {
  const digit = /^(?:Digit|Numpad)([1-5])$/.exec(event.code)?.[1] ?? /^[1-5]$/.exec(event.key)?.[0];
  if (digit === undefined) return null;
  return REACTION_EMOJIS[Number(digit) - 1] ?? null;
}

/**
 * Keys `1`–`5` react (E7-S4), unless the person is typing (chat, search) or holds a modifier.
 */
export function useReactionKeys(onReact: (emoji: ReactionEmoji) => void, target: Window = window) {
  const callback = useRef(onReact);
  useEffect(() => {
    callback.current = onReact;
  }, [onReact]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.repeat) return;
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      if (isTypingTarget(event.target)) return;
      const emoji = reactionOfKey(event);
      if (emoji !== null) callback.current(emoji);
    };
    target.addEventListener('keydown', onKeyDown);
    return () => {
      target.removeEventListener('keydown', onKeyDown);
    };
  }, [target]);
}
