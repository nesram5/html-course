import type { SpaceDetailDto } from '@plaza/shared';
import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { errorMessageKey } from '@/shared/api';
import { toast } from '@/shared/ui';

import { useMapTemplates, useUpdateSpace } from '../hooks/useSpaces';

/**
 * "Estilo" (E9-S1): the styles of the space's template with their thumbnails. Owners pick one
 * and apply it (everyone connected sees it change live); members see the current one only.
 */
export function ThemeSettings({ space }: { space: SpaceDetailDto }) {
  const { t } = useTranslation('spaces');
  const { t: tc } = useTranslation();
  const titleId = useId();
  const templates = useMapTemplates();
  const update = useUpdateSpace(space.id);
  const [chosen, setChosen] = useState(space.themeId);
  const isOwner = space.role === 'OWNER';
  const themes = templates.data?.find((template) => template.id === space.mapTemplateId)?.themes;

  return (
    <section aria-labelledby={titleId} className="flex flex-col gap-3">
      <h2 id={titleId} className="text-lg font-semibold">
        {t('theme.title')}
      </h2>
      <p className="text-sm text-slate-600">
        {isOwner ? t('theme.description') : t('theme.membersReadOnly')}
      </p>
      <form
        className="flex flex-col gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          const name = themes?.find((theme) => theme.id === chosen)?.name ?? chosen;
          update.mutate(
            { themeId: chosen },
            {
              onSuccess: () => toast.success(t('theme.applied', { name })),
              onError: (error) => toast.error(tc(errorMessageKey(error))),
            },
          );
        }}
      >
        <fieldset disabled={!isOwner || update.isPending}>
          <legend className="sr-only">{t('theme.legend')}</legend>
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {(themes ?? []).map((theme) => (
              <li key={theme.id}>
                <label className="flex cursor-pointer flex-col gap-2 rounded-lg border-2 border-slate-200 p-2 has-checked:border-brand-600 has-focus-visible:outline-2 has-focus-visible:outline-brand-500 has-disabled:cursor-default">
                  <img
                    src={theme.thumbnailUrl}
                    alt={t('theme.thumbnailAlt', { name: theme.name })}
                    className="aspect-4/3 w-full rounded object-cover"
                  />
                  <span className="flex items-center gap-2 text-sm font-medium">
                    <input
                      type="radio"
                      name="themeId"
                      value={theme.id}
                      checked={chosen === theme.id}
                      onChange={() => {
                        setChosen(theme.id);
                      }}
                    />
                    {theme.name}
                    {theme.id === space.themeId && (
                      <span className="text-xs font-normal text-slate-600">
                        {t('theme.current')}
                      </span>
                    )}
                  </span>
                </label>
              </li>
            ))}
          </ul>
        </fieldset>
        {isOwner && (
          <button
            type="submit"
            disabled={chosen === space.themeId || update.isPending}
            className="self-start rounded-md bg-brand-600 px-4 py-2 font-medium text-white hover:bg-brand-700 disabled:opacity-50"
          >
            {update.isPending ? t('theme.applying') : t('theme.apply')}
          </button>
        )}
      </form>
    </section>
  );
}
