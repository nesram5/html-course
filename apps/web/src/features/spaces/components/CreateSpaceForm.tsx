import { SPACE_NAME_MAX_LEN, type SpaceDetailDto } from '@bululu/shared';
import { useId, useState, type SyntheticEvent } from 'react';
import { useTranslation } from 'react-i18next';

import { PageLoading } from '@/features/auth';
import { LoadError } from '@/shared/ui';

import { useCreateSpace, useMapTemplates } from '../hooks/useSpaces';
import { FormError } from './FormError';

/** Wizard step 1: name + template (E2-S3). */
export function CreateSpaceForm({ onCreated }: { onCreated: (space: SpaceDetailDto) => void }) {
  const { t } = useTranslation('spaces');
  const nameId = useId();
  const [name, setName] = useState('');
  const [templateId, setTemplateId] = useState<string | null>(null);
  const templates = useMapTemplates();
  const create = useCreateSpace();
  const selected = templateId ?? templates.data?.[0]?.id ?? null;

  const submit = (event: SyntheticEvent) => {
    event.preventDefault();
    if (selected === null) return;
    create.mutate({ name: name.trim(), mapTemplateId: selected }, { onSuccess: onCreated });
  };

  if (templates.isPending) return <PageLoading />;
  if (templates.isError) {
    return (
      <LoadError
        error={templates.error}
        onRetry={() => {
          void templates.refetch();
        }}
      />
    );
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <label htmlFor={nameId} className="font-medium">
          {t('wizard.name')}
        </label>
        <input
          id={nameId}
          required
          maxLength={SPACE_NAME_MAX_LEN}
          value={name}
          placeholder={t('wizard.namePlaceholder')}
          onChange={(event) => {
            setName(event.target.value);
          }}
          className="rounded-md border border-slate-300 px-3 py-2"
        />
      </div>
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 font-medium">{t('wizard.template')}</legend>
        {templates.data.length === 0 && <p className="text-slate-600">{t('wizard.noTemplates')}</p>}
        <div className="grid gap-3 sm:grid-cols-2">
          {templates.data.map((template) => (
            <label
              key={template.id}
              className={`flex cursor-pointer flex-col gap-2 rounded-lg border-2 p-3 has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-brand-600 ${
                selected === template.id ? 'border-brand-600 bg-brand-50' : 'border-slate-200'
              }`}
            >
              <input
                type="radio"
                name="mapTemplateId"
                value={template.id}
                checked={selected === template.id}
                onChange={() => {
                  setTemplateId(template.id);
                }}
                className="sr-only"
              />
              <img
                src={template.thumbnailUrl}
                alt=""
                className="aspect-video w-full object-cover"
              />
              <span className="font-medium">{template.name}</span>
              <span className="text-sm text-slate-600">
                {t('wizard.rooms', { count: template.roomCount })}
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      <FormError error={create.error} />
      <button
        type="submit"
        disabled={create.isPending || selected === null || name.trim() === ''}
        className="self-start rounded-md bg-brand-600 px-4 py-2 font-medium text-white hover:bg-brand-700 disabled:opacity-50"
      >
        {create.isPending ? t('wizard.creating') : t('wizard.submit')}
      </button>
    </form>
  );
}
