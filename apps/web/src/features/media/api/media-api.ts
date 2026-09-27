import {
  API_PATHS,
  apiPath,
  MediaTokenResponseSchema,
  type MediaTokenResponse,
} from '@bululu/shared';

import { http } from '@/shared/api';

/** `POST /api/spaces/:spaceId/media-token` (E5-S3): LiveKit URL, token and its lifetime. */
export function fetchMediaToken(spaceId: string): Promise<MediaTokenResponse> {
  return http(apiPath(API_PATHS.mediaToken, { spaceId }), MediaTokenResponseSchema, {
    method: 'POST',
  });
}
