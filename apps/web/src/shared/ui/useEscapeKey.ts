import { useEffect, useRef, type RefObject } from 'react';

/**
 * `Escape` pressed anywhere inside the returned element calls `onEscape` (non-modal panels such
 * as the office's side panels: `Escape` closes them, like their close button). A key another
 * handler already used (`preventDefault`) is left alone.
 */
export function useEscapeKey<T extends HTMLElement>(onEscape: () => void): RefObject<T | null> {
  const ref = useRef<T>(null);
  const handlerRef = useRef(onEscape);
  useEffect(() => {
    handlerRef.current = onEscape;
  });

  useEffect(() => {
    const root = ref.current;
    if (root === null) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      event.preventDefault();
      handlerRef.current();
    };
    root.addEventListener('keydown', onKeyDown);
    return () => {
      root.removeEventListener('keydown', onKeyDown);
    };
  }, []);

  return ref;
}
