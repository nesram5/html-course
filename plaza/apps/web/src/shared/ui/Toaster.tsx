import { useTranslation } from 'react-i18next';

import { useToastStore, type ToastKind } from './toast-store';

const KIND_CLASSES: Record<ToastKind, string> = {
  info: 'border-slate-300 bg-white',
  success: 'border-green-300 bg-green-50',
  error: 'border-red-300 bg-red-50',
};

/**
 * Renders the toasts of `useToastStore` in a polite live region. A toast stays while it is
 * hovered or has the focus (WCAG 2.2.1). Bottom left, above the office's bottom bar: the side
 * panels (chat, people) and the map controls are on the right.
 */
export function Toaster() {
  const { t } = useTranslation();
  const toasts = useToastStore((state) => state.toasts);
  const dismiss = useToastStore((state) => state.dismiss);
  const pause = useToastStore((state) => state.pause);
  const resume = useToastStore((state) => state.resume);

  return (
    <section
      aria-label={t('toasts.region')}
      aria-live="polite"
      className="pointer-events-none fixed bottom-24 left-4 z-50 flex w-80 max-w-[calc(100%-2rem)] flex-col gap-2"
    >
      {toasts.map((item) => (
        <div
          key={item.id}
          role={item.kind === 'error' ? 'alert' : 'status'}
          className={`pointer-events-auto flex items-start gap-3 rounded-lg border p-3 shadow ${KIND_CLASSES[item.kind]}`}
          onMouseEnter={() => {
            pause(item.id);
          }}
          onMouseLeave={() => {
            resume(item.id);
          }}
          onFocus={() => {
            pause(item.id);
          }}
          onBlur={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget)) resume(item.id);
          }}
        >
          <div className="flex flex-1 flex-col items-start gap-2">
            <p className="text-sm">{item.message}</p>
            {item.action !== undefined && (
              <button
                type="button"
                className="rounded-md bg-brand-600 px-2 py-1 text-xs font-medium text-white hover:bg-brand-700"
                onClick={() => {
                  item.action?.run();
                  dismiss(item.id);
                }}
              >
                {item.action.label}
              </button>
            )}
          </div>
          <button
            type="button"
            aria-label={t('toasts.dismiss')}
            className="rounded px-1 text-slate-600 hover:text-slate-900"
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
