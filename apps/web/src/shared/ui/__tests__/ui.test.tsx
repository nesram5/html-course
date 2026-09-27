import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { I18nextProvider } from 'react-i18next';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createI18n } from '@/shared/i18n';

import { ErrorBoundary } from '../ErrorBoundary';
import { ErrorFallback } from '../ErrorFallback';
import { Toaster } from '../Toaster';
import { toast, useToastStore } from '../toast-store';

function Bomb({ explode }: { explode: boolean }) {
  if (explode) throw new Error('render failed');
  return <p>contenido</p>;
}

describe('ErrorBoundary', () => {
  it('shows the fallback and can retry', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const user = userEvent.setup();
    let explode = true;
    const view = () => (
      <I18nextProvider i18n={createI18n()}>
        <ErrorBoundary fallback={(reset) => <ErrorFallback onRetry={reset} />}>
          <Bomb explode={explode} />
        </ErrorBoundary>
      </I18nextProvider>
    );
    const { rerender } = render(view());

    expect(screen.getByRole('heading', { name: 'Algo ha fallado' })).toBeInTheDocument();
    explode = false;
    rerender(view());
    await user.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(screen.getByText('contenido')).toBeInTheDocument();
  });
});

describe('Toaster', () => {
  afterEach(() => {
    vi.useRealTimers();
    useToastStore.setState({ toasts: [] });
  });

  it('shows toasts, lets people dismiss them and hides them after 5 s', async () => {
    const user = userEvent.setup();
    render(
      <I18nextProvider i18n={createI18n()}>
        <Toaster />
      </I18nextProvider>,
    );

    act(() => {
      toast.error('Algo salió mal');
    });
    expect(screen.getByRole('alert')).toHaveTextContent('Algo salió mal');
    await user.click(screen.getByRole('button', { name: 'Cerrar aviso' }));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();

    vi.useFakeTimers();
    act(() => {
      toast.success('Guardado');
    });
    expect(screen.getByRole('status')).toHaveTextContent('Guardado');
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('keeps a toast while it is hovered or focused, and errors longer (WCAG 2.2.1)', () => {
    vi.useFakeTimers();
    render(
      <I18nextProvider i18n={createI18n()}>
        <Toaster />
      </I18nextProvider>,
    );
    act(() => {
      toast.info('Luis te está llamando');
      toast.error('Algo salió mal');
    });
    const info = screen.getByRole('status');

    fireEvent.mouseEnter(info);
    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    expect(screen.getByRole('status')).toBeInTheDocument();
    fireEvent.mouseLeave(info);
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('runs the action of a toast and closes it', () => {
    const run = vi.fn();
    render(
      <I18nextProvider i18n={createI18n()}>
        <Toaster />
      </I18nextProvider>,
    );
    act(() => {
      toast.info('Luis te está llamando', { action: { label: 'Activar avisos', run } });
    });

    fireEvent.click(screen.getByRole('button', { name: 'Activar avisos' }));

    expect(run).toHaveBeenCalledOnce();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('gives errors 10 s', () => {
    vi.useFakeTimers();
    render(
      <I18nextProvider i18n={createI18n()}>
        <Toaster />
      </I18nextProvider>,
    );
    act(() => {
      toast.error('Algo salió mal');
    });
    act(() => {
      vi.advanceTimersByTime(9999);
    });
    expect(screen.getByRole('alert')).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
