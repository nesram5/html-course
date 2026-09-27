import { CHAT_MAX_LEN } from '@bululu/shared';
import { act, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { isTypingTarget, RealtimeRequestError } from '@/features/world';
import { renderWithProviders } from '@/test/providers';

import { ChatButton } from '../components/ChatButton';
import { ChatPanel } from '../components/ChatPanel';
import { createChatStore, type ChatStore } from '../store/chat-store';
import { message } from './fixtures';

let store: ChatStore;

beforeEach(() => {
  store = createChatStore();
});

function renderPanel(send: (body: string) => Promise<void> = () => Promise.resolve()) {
  return renderWithProviders(
    <ChatPanel
      names={{ 'user-2': 'Luis' }}
      selfId="user-1"
      onClose={vi.fn()}
      send={send}
      store={store}
    />,
  );
}

describe('ChatPanel (E7-S3)', () => {
  it('shows authors, escaped text and safe clickable links', () => {
    store.getState().mergeHistory([
      message({ id: 'a', authorId: 'user-2', body: '<b>hola</b> mira https://acme.com/x' }),
      message({
        id: 'b',
        authorId: 'user-1',
        body: 'Voy',
        createdAt: '2026-09-27T10:01:00.000Z',
      }),
      message({ id: 'c', authorId: null, body: 'adiós', createdAt: '2026-09-27T10:02:00.000Z' }),
    ]);

    renderPanel();

    const items = screen.getAllByTestId('chat-message');
    expect(items.map((item) => item.querySelector('span')?.textContent)).toEqual([
      'Luis',
      'Tú',
      'Usuario eliminado',
    ]);
    // Markup is shown as text, never interpreted.
    expect(items[0]).toHaveTextContent('<b>hola</b> mira https://acme.com/x');
    expect(items[0]?.querySelector('b')).toBeNull();
    const link = screen.getByRole('link', { name: 'https://acme.com/x' });
    expect(link).toHaveAttribute('href', 'https://acme.com/x');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('sends with Enter, clears the box and keeps the focus there', async () => {
    const user = userEvent.setup();
    const send = vi.fn(() => Promise.resolve());
    renderPanel(send);
    const input = screen.getByRole('textbox', { name: 'Mensaje para todo el espacio' });
    expect(input).toHaveFocus();

    await user.type(input, 'Hola equipo{Enter}');

    expect(send).toHaveBeenCalledWith('Hola equipo');
    expect(input).toHaveValue('');
    expect(input).toHaveFocus();
  });

  it('typing in the box never moves the avatar (the world ignores text fields)', () => {
    renderPanel();

    expect(isTypingTarget(screen.getByRole('textbox'))).toBe(true);
  });

  it(`refuses messages over ${String(CHAT_MAX_LEN)} characters with a clear error`, async () => {
    const user = userEvent.setup();
    const send = vi.fn(() => Promise.resolve());
    renderPanel(send);
    const input = screen.getByRole('textbox');

    await user.click(input);
    await user.paste('a'.repeat(CHAT_MAX_LEN + 1));
    await user.keyboard('{Enter}');

    expect(send).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent(
      'El mensaje no puede superar 1000 caracteres (tiene 1001).',
    );
    expect(input).toHaveAttribute('aria-invalid', 'true');
  });

  it('explains the server refusal when sending more than 5 per second', async () => {
    const user = userEvent.setup();
    renderPanel(() => Promise.reject(new RealtimeRequestError('RATE_LIMITED', 'slow down')));

    await user.type(screen.getByRole('textbox'), 'otra vez{Enter}');

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No se pudo enviar: Vas demasiado rápido. Espera un momento.',
    );
    expect(screen.getByRole('textbox')).toHaveValue('otra vez');
  });

  it('opening the panel clears the unread counter of the chat button', () => {
    const toggle = vi.fn();
    const { unmount } = renderWithProviders(
      <ChatButton expanded={false} onToggle={toggle} store={store} />,
    );
    act(() => {
      store.getState().receive(message({ id: 'x' }), false);
      store.getState().receive(message({ id: 'y' }), false);
      store.getState().receive(message({ id: 'z' }), true);
    });

    expect(
      screen.getByRole('button', { name: 'Chat del espacio: 2 mensajes sin leer' }),
    ).toBeVisible();
    expect(screen.getByTestId('chat-unread')).toHaveTextContent('2');
    unmount();

    renderPanel();

    expect(store.getState().unread).toBe(0);
  });
});
