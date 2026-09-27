import { useEffect } from 'react';

/** Keyboard shortcuts of the media controls (same keys as Google Meet). */
export const MEDIA_SHORTCUTS = {
  /** Ctrl+D (⌘+D on macOS): microphone on/off. */
  mic: 'KeyD',
  /** Ctrl+E (⌘+E on macOS): camera on/off. */
  camera: 'KeyE',
} as const;

export interface MediaShortcutHandlers {
  toggleMic(): void;
  toggleCamera(): void;
}

/** Which media shortcut a key press is, if any: Ctrl/⌘ + D or E, no other modifier. */
export function mediaShortcutOf(
  event: Pick<KeyboardEvent, 'code' | 'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey'>,
): keyof typeof MEDIA_SHORTCUTS | null {
  if (!(event.ctrlKey || event.metaKey) || event.altKey || event.shiftKey) return null;
  if (event.code === MEDIA_SHORTCUTS.mic) return 'mic';
  if (event.code === MEDIA_SHORTCUTS.camera) return 'camera';
  return null;
}

/** Listens to the media shortcuts on `window` while mounted (E5-S6). */
export function useMediaShortcuts(handlers: MediaShortcutHandlers, target: Window = window): void {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      const shortcut = mediaShortcutOf(event);
      if (shortcut === null) return;
      // Ctrl+D would bookmark the page and Ctrl+E focus the address bar.
      event.preventDefault();
      if (event.repeat) return;
      if (shortcut === 'mic') handlers.toggleMic();
      else handlers.toggleCamera();
    };
    target.addEventListener('keydown', onKeyDown);
    return () => {
      target.removeEventListener('keydown', onKeyDown);
    };
  }, [handlers, target]);
}
