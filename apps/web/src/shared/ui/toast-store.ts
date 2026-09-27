import { create } from 'zustand';

export type ToastKind = 'info' | 'success' | 'error';

/** A button inside a toast ("Activar avisos"). Runs from the click: a user gesture. */
export interface ToastAction {
  /** Already translated label. */
  readonly label: string;
  readonly run: () => void;
}

export interface Toast {
  id: number;
  kind: ToastKind;
  /** Already translated text. */
  message: string;
  action?: ToastAction;
}

export interface ToastOptions {
  readonly action?: ToastAction;
}

interface ToastState {
  toasts: Toast[];
  push: (kind: ToastKind, message: string, options?: ToastOptions) => number;
  dismiss: (id: number) => void;
  /** Hovered or focused: the toast stays until `resume` (WCAG 2.2.1). */
  pause: (id: number) => void;
  /** Starts counting down again, with the whole delay. */
  resume: (id: number) => void;
}

/** How long a toast stays: errors and toasts with a button get more time to be read and used. */
export const TOAST_DURATION_MS = { info: 5000, success: 5000, error: 10_000 } as const;
export const TOAST_ACTION_DURATION_MS = 15_000;

let nextId = 1;
const timers = new Map<number, ReturnType<typeof setTimeout>>();

function durationOf(toast: Toast): number {
  return toast.action === undefined ? TOAST_DURATION_MS[toast.kind] : TOAST_ACTION_DURATION_MS;
}

function clearTimer(id: number): void {
  const timer = timers.get(id);
  if (timer !== undefined) clearTimeout(timer);
  timers.delete(id);
}

export const useToastStore = create<ToastState>()((set, get) => {
  const schedule = (toast: Toast): void => {
    clearTimer(toast.id);
    timers.set(
      toast.id,
      setTimeout(() => {
        get().dismiss(toast.id);
      }, durationOf(toast)),
    );
  };
  return {
    toasts: [],
    push: (kind, message, options = {}) => {
      const id = nextId++;
      const toast: Toast = {
        id,
        kind,
        message,
        ...(options.action !== undefined && { action: options.action }),
      };
      set({ toasts: [...get().toasts, toast] });
      schedule(toast);
      return id;
    },
    dismiss: (id) => {
      clearTimer(id);
      set({ toasts: get().toasts.filter((toast) => toast.id !== id) });
    },
    pause: (id) => {
      clearTimer(id);
    },
    resume: (id) => {
      const toast = get().toasts.find((item) => item.id === id);
      if (toast !== undefined) schedule(toast);
    },
  };
});

/** Shows a toast from anywhere (also outside React). Pass translated text. */
export const toast = {
  info: (message: string, options?: ToastOptions) =>
    useToastStore.getState().push('info', message, options),
  success: (message: string, options?: ToastOptions) =>
    useToastStore.getState().push('success', message, options),
  error: (message: string, options?: ToastOptions) =>
    useToastStore.getState().push('error', message, options),
};
