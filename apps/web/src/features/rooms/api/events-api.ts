import { API_PATHS, apiPath, type TrackEventBody } from '@plaza/shared';

import { http } from '@/shared/api';

/**
 * `POST /api/spaces/:spaceId/events` (E6-S2, E8-S7): a product event without personal data
 * (only ids). `room_entered` is recorded by the server itself.
 */
export function trackEvent(spaceId: string, body: TrackEventBody): Promise<void> {
  return http(apiPath(API_PATHS.events, { spaceId }), null, { method: 'POST', body });
}
