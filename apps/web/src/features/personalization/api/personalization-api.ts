import { API_PATHS, apiPath, DeskResponseSchema, parseMap, type DeskDecor } from '@plaza/shared';

import { http } from '@/shared/api';

/** Query keys of the personalization feature (standards §5). */
export const personalizationKeys = {
  all: ['personalization'] as const,
  mapDesks: (mapUrl: string) => ['personalization', 'map-desks', mapUrl] as const,
};

type Signal = { signal?: AbortSignal };
const opts = ({ signal }: Signal) => (signal ? { signal } : {});

/** Claims a free desk for me, or (owners) assigns it to `userId` (E9-S2, RN-13, RN-14). */
export async function claimDesk(spaceId: string, deskId: string, userId?: string) {
  const path = apiPath(API_PATHS.desk, { spaceId, deskId });
  const body = userId === undefined ? {} : { userId };
  return (await http(path, DeskResponseSchema, { method: 'PUT', body })).desk;
}

/** Frees a desk: mine, or anyone's for owners. */
export function releaseDesk(spaceId: string, deskId: string) {
  return http(apiPath(API_PATHS.desk, { spaceId, deskId }), null, { method: 'DELETE' });
}

/** Saves the decoration of my desk (E9-S3). */
export async function saveDeskDecor(spaceId: string, deskId: string, decor: DeskDecor) {
  const path = apiPath(API_PATHS.deskDecor, { spaceId, deskId });
  return (await http(path, DeskResponseSchema, { method: 'PATCH', body: decor })).desk;
}

/** Desk ids of a template map (its `map.tmj`, parsed like the world does), in map order. */
export async function fetchMapDeskIds(mapUrl: string, o: Signal = {}): Promise<string[]> {
  const response = await fetch(mapUrl, {
    credentials: 'include',
    headers: { Accept: 'application/json' },
    ...opts(o),
  });
  if (!response.ok) throw new Error(`GET ${mapUrl} failed with ${String(response.status)}`);
  return parseMap(await response.json()).desks.map((desk) => desk.deskId);
}
