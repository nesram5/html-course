import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { act } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { renderWithProviders } from '@/test/providers';

import { AwayCard } from '../components/AwayCard';
import { StatusMenu } from '../components/StatusMenu';
import { createPresenceStore, type PresenceStore } from '../store/presence-store';
import { player, snapshot } from './fixtures';

let store: PresenceStore;

beforeEach(() => {
  store = createPresenceStore();
  store.getState().applySnapshot(snapshot());
});

describe('StatusMenu (E7-S1)', () => {
  it('shows the chosen status and changes it from the menu', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn((status: 'available' | 'busy') => {
      store.getState().setStatus(status);
    });
    renderWithProviders(<StatusMenu store={store} onSelect={onSelect} />);
    const button = screen.getByRole('button', { name: 'Estado: Disponible' });

    await user.click(button);
    expect(screen.getByRole('menuitemradio', { name: /Disponible/ })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    await user.click(screen.getByRole('menuitemradio', { name: /Ocupado/ }));

    expect(onSelect).toHaveBeenCalledWith('busy');
    expect(screen.queryByRole('menu')).toBeNull();
    expect(screen.getByRole('button', { name: 'Estado: Ocupado' })).toHaveFocus();
  });

  it('works with the keyboard: arrows, Enter and Escape', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    renderWithProviders(<StatusMenu store={store} onSelect={onSelect} />);

    screen.getByRole('button', { name: 'Estado: Disponible' }).focus();
    await user.keyboard('{Enter}');
    expect(screen.getByRole('menuitemradio', { name: /Disponible/ })).toHaveFocus();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('menu')).toBeNull();
    expect(screen.getByRole('button', { name: 'Estado: Disponible' })).toHaveFocus();

    await user.keyboard('{Enter}{ArrowDown}{Enter}');
    expect(onSelect).toHaveBeenCalledWith('busy');
  });

  it('shows "Ausente" while away, keeping the chosen status checked', async () => {
    const user = userEvent.setup();
    renderWithProviders(<StatusMenu store={store} onSelect={vi.fn()} />);

    act(() => {
      store.getState().setAway(true);
    });
    await user.click(screen.getByRole('button', { name: 'Estado: Ausente' }));

    expect(screen.getByRole('menuitemradio', { name: /Disponible/ })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    expect(screen.getByText('Ahora mismo apareces como Ausente')).toBeVisible();
  });
});

describe('AwayCard (E7-S1): "Ausente · Llamar" on the video tile', () => {
  it('shows the card with "Llamar" only while the person is away', () => {
    renderWithProviders(<AwayCard userId="user-2" store={store} />);
    expect(screen.queryByRole('group')).toBeNull();

    act(() => {
      store.getState().applyDelta({
        moved: [],
        joined: [],
        left: [],
        changed: [{ userId: 'user-2', away: true }],
      });
    });

    expect(screen.getByRole('group', { name: 'Luis está ausente' })).toHaveTextContent('Ausente');
    expect(screen.getByRole('button', { name: 'Llamar a Luis' })).toBeVisible();
  });

  it('never offers to ring myself', () => {
    store
      .getState()
      .applySnapshot(
        snapshot({ self: player({ userId: 'user-1', displayName: 'Ana', away: true }) }),
      );

    renderWithProviders(<AwayCard userId="user-1" store={store} />);

    expect(screen.getByRole('group', { name: 'Ana está ausente' })).toBeVisible();
    expect(screen.queryByRole('button')).toBeNull();
  });
});
