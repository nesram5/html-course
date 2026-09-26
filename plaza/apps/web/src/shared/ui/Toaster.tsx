import { useTranslation } from 'react-i18next';

import { useToastStore, type ToastKind } from './toast-store';

const KIND_CLASSES: Record<ToastKind, string> = {
  info: 'border-slate-300 bg-white',
  success: 'border-green-300 bg-green-50',
  error: 'border-red-300 bg-red-50',
};

/** Renders the toasts of `useToastStore` in a polite live region. */
export function Toaster() {
  const { t } = useTranslation();
  const toasts = useToastStore((state) => state.toasts);
  const dismiss = useToastStore((state) => state.dismiss);

  return (
    <section
      aria-label={t('toasts.region')}
      aria-live="polite"
      className="pointer-events-none fixed right-4 bottom-4 z-50 flex w-80 flex-col gap-2"
    >
      {toasts.map((item) => (
        <div
          key={item.id}
          role={item.kind === 'error' ? 'alert' : 'status'}
          className={`pointer-events-auto flex items-start gap-3 rounded-lg border p-3 shadow ${KIND_CLASSES[item.kind]}`}
        >
          <p className="flex-1 text-sm">{item.message}</p>
          <button
            type="button"
            aria-label={t('toasts.dismiss')}
            className="rounded px-1 text-slate-500 hover:text-slate-900"
            onClick={() => {
              dismiss(item.id);
            }}
          >
            ×
          </button>
        </div>
      ))}
    </section>
  );
}
