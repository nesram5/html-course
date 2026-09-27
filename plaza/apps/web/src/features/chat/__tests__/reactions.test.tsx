import { fireEvent, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { renderWithProviders } from '@/test/providers';

import { ReactionPicker } from '../components/ReactionPicker';
import { reactionOfKey } from '../hooks/useReactionKeys';

describe('ReactionPicker (E7-S4)', () => {
  it('offers the five reactions from the emoji button', async () => {
    const user = userEvent.setup();
    const react = vi.fn();
    renderWithProviders(<ReactionPicker react={react} />);

    await user.click(screen.getByRole('button', { name: 'Reaccionar' }));
    const buttons = screen.getAllByRole('button', { name: /\(tecla \d\)/ });
    expect(buttons.map((button) => button.getAttribute('aria-label'))).toEqual([
      'Corazón (tecla 1)',
      'Me gusta (tecla 2)',
      'Fiesta (tecla 3)',
      'Risa (tecla 4)',
      'Saludo (tecla 5)',
    ]);
    expect(buttons[0]).toHaveFocus();

    await user.click(screen.getByRole('button', { name: 'Fiesta (tecla 3)' }));
    expect(react).toHaveBeenCalledWith('🎉');

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('toolbar')).toBeNull();
    expect(screen.getByRole('button', { name: 'Reaccionar' })).toHaveFocus();
  });

  it('reacts with the keys 1 to 5, but not while typing or with modifiers', () => {
    const react = vi.fn();
    renderWithProviders(
      <>
        <ReactionPicker react={react} />
        <input aria-label="chat" />
      </>,
    );

    fireEvent.keyDown(window, { key: '1', code: 'Digit1' });
    fireEvent.keyDown(window, { key: '5', code: 'Numpad5' });
    fireEvent.keyDown(window, { key: '2', code: 'Digit2', ctrlKey: true });
    fireEvent.keyDown(window, { key: '6', code: 'Digit6' });
    fireEvent.keyDown(screen.getByRole('textbox', { name: 'chat' }), { key: '3', code: 'Digit3' });

    expect(react.mock.calls).toEqual([['❤️'], ['👋']]);
  });

  it('maps keys by position, whatever the keyboard layout', () => {
    // French AZERTY: the "1" key without Shift types "&".
    expect(reactionOfKey({ key: '&', code: 'Digit1' })).toBe('❤️');
    expect(reactionOfKey({ key: '4', code: '' })).toBe('😂');
    expect(reactionOfKey({ key: 'a', code: 'KeyA' })).toBeNull();
  });
});
