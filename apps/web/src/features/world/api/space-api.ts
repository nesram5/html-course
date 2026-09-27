import { API_PATHS, DecorCatalogResponseSchema, MapTemplatesResponseSchema } from '@bululu/shared';

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

/** Style ids of a map template, to load them ahead in the office (E9 follow-up). */
export async function fetchTemplateThemeIds(
  mapTemplateId: string,
  { signal }: { signal?: AbortSignal } = {},
): Promise<string[]> {
  const { templates } = await http(
    API_PATHS.mapTemplates,
    MapTemplatesResponseSchema,
    signal ? { signal } : {},
  );
  return templates.find((template) => template.id === mapTemplateId)?.themes.map((t) => t.id) ?? [];
}
