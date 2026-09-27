import { useEffect } from 'react';

import type { SpaceExtension, SpaceSlotProps } from '@/features/world';
import { setErrorContext } from '@/shared/lib/sentry';

/** Draws nothing: tags error reports with the open office while it is open (E8-S1). */
function ErrorContextOverlay({ space }: SpaceSlotProps) {
  const { spaceId, userId } = space;
  useEffect(() => {
    setErrorContext({ userId, spaceId });
    return () => {
      setErrorContext({ spaceId: null });
    };
  }, [spaceId, userId]);
  return null;
}

/** Error reports sent from the office carry its `spaceId` (Sentry tag) and the `userId`. */
export const errorContextSpaceExtension: SpaceExtension = {
  id: 'error-context',
  Overlay: ErrorContextOverlay,
};
