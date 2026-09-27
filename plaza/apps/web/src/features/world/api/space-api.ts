/** Query keys of the feature (standards §5). The space itself comes from `useEnterSpace`. */
export const worldKeys = {
  all: ['world'] as const,
  assets: (mapTemplateId: string, themeId: string) =>
    ['world', 'assets', mapTemplateId, themeId] as const,
};
