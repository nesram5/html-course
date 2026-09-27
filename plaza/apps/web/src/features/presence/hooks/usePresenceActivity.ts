import { useEffect, useRef } from 'react';

import { PresenceActivity } from '../lib/presence-activity';

export interface UsePresenceActivityOptions {
  /** Inactivity before becoming away (default `AWAY_IDLE_MS`, 10 min). */
  readonly idleMs?: number;
  /** Off while the person is not in a space. */
  readonly enabled?: boolean;
}

/**
 * Watches the tab visibility and the person's interactions while mounted (E7-S1, RN-05) and
 * calls `onChange(away)` whenever the away flag changes.
 */
export function usePresenceActivity(
  onChange: (away: boolean) => void,
  { idleMs, enabled = true }: UsePresenceActivityOptions = {},
): void {
  const callback = useRef(onChange);
  useEffect(() => {
    callback.current = onChange;
  }, [onChange]);

  useEffect(() => {
    if (!enabled) return undefined;
    const activity = new PresenceActivity({
      document,
      window,
      ...(idleMs !== undefined && { idleMs }),
      onChange: (away) => {
        callback.current(away);
      },
    });
    activity.start();
    return () => {
      activity.stop();
    };
  }, [enabled, idleMs]);
}
