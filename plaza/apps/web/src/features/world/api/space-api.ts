import {
  API_PATHS,
  EnterSpaceResponseSchema,
  MeResponseSchema,
  apiPath,
  type EnterSpaceResponse,
  type Me,
} from '@plaza/shared';

import { http } from '@/shared/api';

/** Query keys of the feature (standards §5). */
export const worldKeys = {
  all: ['world'] as const,
  space: (slug: string) => ['world', 'space', slug] as const,
  me: () => ['world', 'me'] as const,
  assets: (mapTemplateId: string, themeId: string) =>
    ['world', 'assets', mapTemplateId, themeId] as const,
};

/** `POST /api/spaces/by-slug/:slug/enter`: the space of `/s/:slug` (joins by domain when allowed). */
export function enterSpace(slug: string, signal?: AbortSignal): Promise<EnterSpaceResponse> {
  return http(apiPath(API_PATHS.spaceEnterBySlug, { slug }), EnterSpaceResponseSchema, {
    method: 'POST',
    ...(signal !== undefined && { signal }),
  });
}

/** `GET /api/me`: name and avatar of the local player. */
export async function fetchMe(signal?: AbortSignal): Promise<Me> {
  const response = await http(
    API_PATHS.me,
    MeResponseSchema,
    signal === undefined ? {} : { signal },
  );
  return response.user;
}
