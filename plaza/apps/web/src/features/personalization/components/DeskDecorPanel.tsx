import { DESK_DECOR_SLOTS, type DecorItemDto, type DeskDecor } from '@plaza/shared';
import { useEffect, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { officeStore, type OfficeStore } from '@/features/world';

import { useDialog } from '@/shared/ui';

export interface DeskDecorPanelProps {
  readonly deskId: string;
  /** Saved decoration of the desk (`null`: nothing yet). */
  readonly decor: DeskDecor | null;
  readonly catalog: readonly DecorItemDto[];
  readonly saving: boolean;
  readonly onSave: (decor: DeskDecor) => void;
  readonly onClose: () => void;
  /** Where the live preview goes (the world draws it on the desk). */
  readonly office?: OfficeStore;
}

const SLOT_BUTTON =
  'flex h-16 w-16 flex-col items-center justify-center rounded-lg border-2 bg-slate-50 text-xs focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500';

function emptySlots(): (string | null)[] {
  return Array.from({ length: DESK_DECOR_SLOTS }, () => null);
}

/**
 * "Decorar" (E9-S3): the 3 slots of my desk and the catalog. Choosing a slot and then an object
 * puts it there; the world shows the result on the desk as a live preview until it is saved or
 * cancelled. Keyboard: Tab through slots and objects, Enter/Space to choose, Escape to close.
 */
export function DeskDecorPanel({
  deskId,
  decor,
  catalog,
  saving,
  onSave,
  onClose,
  office = officeStore,
}: DeskDecorPanelProps) {
  const { t } = useTranslation('personalization');
  const titleId = useId();
  const [slots, setSlots] = useState<(string | null)[]>(() => decor?.slots.slice() ?? emptySlots());
  const [selected, setSelected] = useState(0);
  const dialogRef = useDialog<HTMLDivElement>(onClose);
  const slotsRef = useRef<HTMLDivElement>(null);
  const byId = new Map(catalog.map((item) => [item.id, item]));

  useEffect(() => {
    office.getState().setPreview({ deskId, decor: { slots } });
  }, [office, deskId, slots]);
  useEffect(
    () => () => {
      office.getState().setPreview(null);
    },
    [office],
  );

  const place = (itemId: string | null) => {
    setSlots((current) => current.map((slot, i) => (i === selected ? itemId : slot)));
  };
  const slotLabel = (i: number) => {
    const item = byId.get(slots[i] ?? '');
    return item === undefined
      ? t('decor.slotEmpty', { n: i + 1 })
      : t('decor.slotWith', { n: i + 1, name: item.name });
  };

  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      className="w-[min(28rem,calc(100vw-2rem))] rounded-xl bg-white p-4 text-slate-900 shadow-xl"
    >
      <h2 id={titleId} className="text-lg font-semibold">
        {t('decor.title')}
      </h2>
      <p className="text-sm text-slate-600">{t('decor.help')}</p>

      <fieldset className="mt-3">
        <legend className="text-sm font-medium">{t('decor.slots')}</legend>
        <div ref={slotsRef} className="mt-2 flex items-center gap-3">
          {slots.map((itemId, i) => {
            const item = byId.get(itemId ?? '');
            return (
              <button
                // Slots are positions, not data: the index is their identity.
                key={i}
                type="button"
                data-autofocus={i === 0 ? true : undefined}
                aria-pressed={selected === i}
                aria-label={slotLabel(i)}
                className={`${SLOT_BUTTON} ${selected === i ? 'border-brand-600' : 'border-slate-200'}`}
                onClick={() => {
                  setSelected(i);
                }}
              >
                {item === undefined ? (
                  <span aria-hidden="true">{i + 1}</span>
                ) : (
                  <img
                    src={item.spriteUrl}
                    alt=""
                    className="h-8 w-8 [image-rendering:pixelated]"
                  />
                )}
              </button>
            );
          })}
          <button
            type="button"
            className="ml-auto rounded-md border border-slate-300 px-3 py-1 text-sm disabled:opacity-40"
            disabled={slots[selected] === null}
            onClick={() => {
              place(null);
              // This button is disabled once the slot is empty: keep the focus on the slot.
              slotsRef.current?.querySelector<HTMLElement>('[aria-pressed="true"]')?.focus();
            }}
          >
            {t('decor.clear', { n: selected + 1 })}
          </button>
        </div>
      </fieldset>

      <fieldset className="mt-4">
        <legend className="text-sm font-medium">{t('decor.catalog', { n: selected + 1 })}</legend>
        <ul className="mt-2 grid max-h-60 grid-cols-4 gap-2 overflow-y-auto p-1">
          {catalog.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                aria-pressed={slots[selected] === item.id}
                className="flex w-full flex-col items-center gap-1 rounded-lg border border-slate-200 p-2 text-xs hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 aria-pressed:border-brand-600"
                onClick={() => {
                  place(item.id);
                }}
              >
                <img src={item.spriteUrl} alt="" className="h-8 w-8 [image-rendering:pixelated]" />
                <span>{item.name}</span>
              </button>
            </li>
          ))}
        </ul>
      </fieldset>

      <div className="mt-4 flex justify-end gap-2">
        <button
          type="button"
          className="rounded-md border border-slate-300 px-4 py-2 text-sm"
          onClick={onClose}
        >
          {t('decor.cancel')}
        </button>
        <button
          type="button"
          disabled={saving}
          className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
          onClick={() => {
            onSave({ slots });
          }}
        >
          {saving ? t('decor.saving') : t('decor.save')}
        </button>
      </div>
    </div>
  );
}
