import type { DeskDecor } from '@plaza/shared';
import { useMutation, useQuery } from '@tanstack/react-query';

import {
  claimDesk,
  fetchDecorCatalog,
  fetchMapDeskIds,
  personalizationKeys,
  releaseDesk,
  saveDeskDecor,
} from '../api/personalization-api';

/** Decoration catalog: it only changes with a deploy. */
export function useDecorCatalog() {
  return useQuery({
    queryKey: personalizationKeys.decor,
    queryFn: ({ signal }) => fetchDecorCatalog({ signal }),
    staleTime: Number.POSITIVE_INFINITY,
  });
}

/** Desk ids of a template map (owner settings: assign desks). */
export function useMapDeskIds(mapUrl: string | undefined) {
  return useQuery({
    queryKey: personalizationKeys.mapDesks(mapUrl ?? ''),
    queryFn: ({ signal }) => fetchMapDeskIds(mapUrl ?? '', { signal }),
    enabled: mapUrl !== undefined,
    staleTime: Number.POSITIVE_INFINITY,
  });
}

/**
 * Desk changes. The office learns about them through `desk:updated` (the server tells everyone,
 * this tab included), so nothing is cached here.
 */
export function useClaimDesk(spaceId: string) {
  return useMutation({
    mutationFn: ({ deskId, userId }: { deskId: string; userId?: string }) =>
      claimDesk(spaceId, deskId, userId),
  });
}

export function useReleaseDesk(spaceId: string) {
  return useMutation({ mutationFn: (deskId: string) => releaseDesk(spaceId, deskId) });
}

export function useSaveDeskDecor(spaceId: string) {
  return useMutation({
    mutationFn: ({ deskId, decor }: { deskId: string; decor: DeskDecor }) =>
      saveDeskDecor(spaceId, deskId, decor),
  });
}
