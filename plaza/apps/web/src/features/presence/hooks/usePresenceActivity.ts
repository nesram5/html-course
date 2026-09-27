import { useEffect, useRef } from 'react';

import { PresenceActivity } from '../lib/presence-activity';

export interface UsePresenceActivityOptions {
  /** Inactivity before becoming away (default `AWAY_IDLE_MS`, 10 min). */
  readonly idleMs?: number;
  /** Off while the person is not in a space. */
  readonly enabled?: boolean;
  /** Called when the tab is hidden or shown again. */
  readonly onHiddenChange?: (hidden: boolean) => void;
}

/**
 * Watches the tab visibility and the person's interactions while mounted (E7-S1, RN-05) and
 * calls `onChange(away)` whenever the away flag changes, and `onHiddenChange(hidden)` whenever the
 * tab is hidden or shown.
 */
export function usePresenceActivity(
  onChange: (away: boolean) => void,
  { idleMs, enabled = true, onHiddenChange }: UsePresenceActivityOptions = {},
): void {
  const callback = useRef(onChange);
  const hiddenCallback = useRef(onHiddenChange);
  useEffect(() => {
    callback.current = onChange;
    hiddenCallback.current = onHiddenChange;
  }, [onChange, onHiddenChange]);

  useEffect(() => {
    if (!enabled) return undefined;
    const activity = new PresenceActivity({
      document,
      window,
      ...(idleMs !== undefined && { idleMs }),
      onChange: (away) => {
        callback.current(away);
      },
      onHiddenChange: (hidden) => {
        hiddenCallback.current?.(hidden);
      },
    });
    activity.start();
    return () => {
      activity.stop();
    };
  }, [enabled, idleMs]);
}
