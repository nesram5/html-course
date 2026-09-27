import { API_PATHS, DecorCatalogResponseSchema } from '@plaza/shared';

import { http } from '@/shared/api';

/** Query keys of the feature (standards §5). The space itself comes from `useEnterSpace`. */
export const worldKeys = {
  all: ['world'] as const,
  decor: ['world', 'decor'] as const,
  assets: (mapTemplateId: string, themeId: string) =>
    ['world', 'assets', mapTemplateId, themeId] as const,
};

/**
 * Desk decoration catalog (`GET /api/decor`, E9-S3): the scene draws the objects on desks and
 * `personalization` offers them in "Decorar".
 */
export async function fetchDecorCatalog({ signal }: { signal?: AbortSignal } = {}) {
  return (await http(API_PATHS.decorCatalog, DecorCatalogResponseSchema, signal ? { signal } : {}))
    .items;
}
