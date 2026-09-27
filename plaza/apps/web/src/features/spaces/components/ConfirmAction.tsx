import { useState } from 'react';
import { useTranslation } from 'react-i18next';

interface ConfirmActionProps {
  /** Text of the button that asks for confirmation. */
  label: string;
  /** Question shown before confirming. */
  question: string;
  onConfirm: () => void;
  disabled?: boolean;
  danger?: boolean;
}

/** A button that asks "¿Seguro?" inline before running a destructive action. */
export function ConfirmAction({
  label,
  question,
  onConfirm,
  disabled,
  danger,
}: ConfirmActionProps) {
  const { t } = useTranslation('spaces');
  const [asking, setAsking] = useState(false);
  const tone = danger === true ? 'border-red-300 text-red-700 hover:bg-red-50' : 'border-slate-300';

  if (!asking) {
    return (
      <button
        type="button"
        disabled={disabled}
        className={`rounded-md border px-3 py-1 text-sm disabled:opacity-50 ${tone}`}
        onClick={() => {
          setAsking(true);
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
          setAsking(false);
          onConfirm();
        }}
      >
        {t('confirm.yes')}
      </button>
      <button
        type="button"
        className="rounded-md border border-slate-300 px-3 py-1"
        onClick={() => {
          setAsking(false);
        }}
      >
        {t('confirm.no')}
      </button>
    </div>
  );
}
