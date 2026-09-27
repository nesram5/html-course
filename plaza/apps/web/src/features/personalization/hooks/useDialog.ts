import { useEffect, useRef, type RefObject } from 'react';

const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function focusablesIn(root: HTMLElement): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>(FOCUSABLE)];
}

/**
 * Keyboard behaviour of the in-world dialogs (desk menu, "Decorar"): focus moves into the dialog
 * (to `[data-autofocus]` or its first control) and back where it was on close, `Tab` stays
 * inside, `Escape` closes, and no key reaches the map while it is open (arrows must not walk
 * the avatar while choosing an object).
 */
export function useDialog<T extends HTMLElement>(onClose: () => void): RefObject<T | null> {
  const ref = useRef<T>(null);
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  });

  useEffect(() => {
    const root = ref.current;
    if (root === null) return undefined;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    (root.querySelector<HTMLElement>('[data-autofocus]') ?? focusablesIn(root)[0] ?? root).focus();

    const onKeyDown = (event: KeyboardEvent) => {
      // Keys handled here never reach the world keyboard (listening on `window`).
      event.stopPropagation();
      if (event.key === 'Escape') {
        event.preventDefault();
        closeRef.current();
        return;
      }
      if (event.key !== 'Tab') return;
      const focusables = focusablesIn(root);
      const first = focusables[0];
      const last = focusables.at(-1);
      if (first === undefined || last === undefined) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    root.addEventListener('keydown', onKeyDown);
    return () => {
      root.removeEventListener('keydown', onKeyDown);
      if (previous?.isConnected === true) previous.focus();
    };
  }, []);

  return ref;
}
