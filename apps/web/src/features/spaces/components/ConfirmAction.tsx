import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

interface ConfirmActionProps {
  /** Text of the button that asks for confirmation. */
  label: string;
  /** Question shown before confirming. */
  question: string;
  onConfirm: () => void;
  disabled?: boolean;
  danger?: boolean;
  /**
   * Where the keyboard focus goes after confirming, when the action removes this very button
   * (e.g. the row of a kicked member): a stable element such as the section heading. By default
   * it goes back to the button.
   */
  focusAfterConfirm?: () => HTMLElement | null;
}

/**
 * A button that asks "¿Seguro?" inline before running a destructive action. The keyboard focus
 * follows (RNF-07): to "Cancelar" when the question appears (its group, labelled with the
 * question, is announced), back to the button after "Cancelar", and to `focusAfterConfirm` (or
 * the button) after confirming. `disabled` is `aria-disabled`, so the button keeps the focus.
 */
export function ConfirmAction({
  label,
  question,
  onConfirm,
  disabled,
  danger,
  focusAfterConfirm,
}: ConfirmActionProps) {
  const { t } = useTranslation('spaces');
  const [asking, setAsking] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  /** Set by the answer: where the focus goes once the question is gone. */
  const focusNext = useRef<(() => HTMLElement | null) | null>(null);
  const tone = danger === true ? 'border-red-300 text-red-700 hover:bg-red-50' : 'border-slate-300';

  useEffect(() => {
    if (asking) {
      cancel.current?.focus();
      return;
    }
    const next = focusNext.current;
    focusNext.current = null;
    if (next !== null) (next() ?? trigger.current)?.focus();
  }, [asking]);

  if (!asking) {
    return (
      <button
        ref={trigger}
        type="button"
        aria-disabled={disabled === true || undefined}
        className={`rounded-md border px-3 py-1 text-sm aria-disabled:cursor-not-allowed aria-disabled:opacity-50 ${tone}`}
        onClick={() => {
          if (disabled !== true) setAsking(true);
        }}
      >
        {label}
      </button>
    );
  }
  return (
    <div role="group" aria-label={question} className="flex flex-wrap items-center gap-2 text-sm">
      <span>{question}</span>
      <button
        type="button"
        className="rounded-md bg-red-600 px-3 py-1 font-medium text-white hover:bg-red-700"
        onClick={() => {
          focusNext.current = focusAfterConfirm ?? (() => trigger.current);
          setAsking(false);
          onConfirm();
        }}
      >
        {t('confirm.yes')}
      </button>
      <button
        ref={cancel}
        type="button"
        className="rounded-md border border-slate-300 px-3 py-1"
        onClick={() => {
          focusNext.current = () => trigger.current;
          setAsking(false);
        }}
      >
        {t('confirm.no')}
      </button>
    </div>
  );
}
