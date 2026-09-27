import { useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router';

import { useSessionStore, worldEvents, type EventBus } from '@/features/world';

/** Query parameter of `/s/:slug` that shows a desk on arrival ("Ir a su escritorio", E9-S2). */
export const DESK_PARAM = 'desk';

/** Builds `/s/:slug?desk=<deskId>`. */
export function deskLink(spacePath: string, deskId: string): string {
  return `${spacePath}?${new URLSearchParams({ [DESK_PARAM]: deskId }).toString()}`;
}

/**
 * With `?desk=<deskId>` in the URL, points the camera at that desk once the office is joined
 * (the first snapshot centers it on me first). Only once per visit.
 */
export function useShowDeskFromUrl(events: EventBus = worldEvents): void {
  const [params] = useSearchParams();
  const deskId = params.get(DESK_PARAM);
  const joined = useSessionStore((state) => state.session.kind === 'joined');
  const shown = useRef(false);

  useEffect(() => {
    if (deskId === null || !joined || shown.current) return;
    shown.current = true;
    events.emit('camera:desk', { deskId });
  }, [deskId, joined, events]);
}
