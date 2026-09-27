import { RING_COOLDOWN_MS } from '@bululu/shared';
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createOfficeStore,
  EventBus,
  RealtimeRequestError,
  type OfficeStore,
} from '@/features/world';
import { mockApi } from '@/test/mock-api';
import { renderWithProviders } from '@/test/providers';

import { PeoplePanel } from '../components/PeoplePanel';
import { RingButton } from '../components/RingButton';
import { createPresenceStore, type PresenceStore } from '../store/presence-store';
import { createRingStore } from '../store/ring-store';
import { player, snapshot } from './fixtures';

function member(userId: string, displayName: string, deskId: string | null = null) {
  return {
    userId,
    displayName,
    avatarId: 'avatar-01',
    email: null,
    role: 'MEMBER',
    status: 'available',
    deskId,
    joinedAt: '2026-09-01T10:00:00.000Z',
  };
}

let store: PresenceStore;
let events: EventBus;
let office: OfficeStore;

beforeEach(() => {
  store = createPresenceStore();
  events = new EventBus();
  office = createOfficeStore();
  store.getState().applySnapshot(
    snapshot({
      players: [
        player({ userId: 'user-2', displayName: 'Luis', roomId: 'sala-1' }),
        player({ userId: 'user-3', displayName: 'Mary', away: true }),
        player({ userId: 'user-4', displayName: 'Óscar', status: 'busy' }),
      ],
    }),
  );
  mockApi({
    'GET /api/spaces/space-1/members': {
      body: {
        members: [
          member('user-1', 'Ana'),
          member('user-2', 'Luis'),
          member('user-3', 'Mary'),
          member('user-4', 'Óscar'),
          member('user-5', 'Zoe', 'desk-05'),
          member('user-6', 'Carla'),
        ],
      },
    },
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function renderPanel(onClose = vi.fn()) {
  return renderWithProviders(
    <PeoplePanel
      spaceId="space-1"
      roomNames={{ 'sala-1': 'Sala 1' }}
      onClose={onClose}
      store={store}
      events={events}
      office={office}
    />,
  );
}

function names(list: HTMLElement): string[] {
  return within(list)
    .getAllByRole('listitem')
    .map((item) => item.textContent);
}

describe('PeoplePanel (E7-S2)', () => {
  it('lists connected people with status and room, then disconnected members', async () => {
    renderPanel();

    const [connected, disconnected] = screen.getAllByRole('list');
    expect(screen.getByRole('heading', { name: 'Conectadas (4)' })).toBeVisible();
    // Me first, then by name.
    expect(names(connected!)[0]).toContain('Ana (tú)');
    expect(within(connected!).getByTestId('person-user-2')).toHaveTextContent(
      'Luis Disponible · En Sala 1',
    );
    expect(within(connected!).getByTestId('person-user-3')).toHaveTextContent('Mary Ausente');
    expect(within(connected!).getByTestId('person-user-4')).toHaveTextContent('Óscar Ocupado');
    await waitFor(() => {
      expect(names(disconnected!)).toEqual(['CarlaDesconectado', 'ZoeDesconectadoEscritorio']);
    });
  });

  it('filters both lists by name, ignoring case and accents', async () => {
    const user = userEvent.setup();
    renderPanel();
    await screen.findByText('Zoe');

    await user.type(screen.getByRole('searchbox', { name: 'Buscar por nombre' }), 'osc');

    expect(screen.getByText('Óscar')).toBeVisible();
    expect(screen.queryByText('Luis')).toBeNull();
    expect(screen.queryByText('Zoe')).toBeNull();

    await user.clear(screen.getByRole('searchbox'));
    await user.type(screen.getByRole('searchbox'), 'nadie');
    expect(screen.getByRole('status')).toHaveTextContent('Nadie coincide con «nadie».');
  });

  it('"Localizar" asks the scene to show that person', async () => {
    const user = userEvent.setup();
    const located: string[] = [];
    events.on('camera:locate', ({ userId }) => located.push(userId));
    renderPanel();

    await user.click(screen.getByRole('button', { name: 'Localizar a Mary en el mapa' }));

    expect(located).toEqual(['user-3']);
  });

  it('"Escritorio" shows the desk of connected and disconnected people who have one (E9-S2)', async () => {
    const user = userEvent.setup();
    const shown: string[] = [];
    events.on('camera:desk', ({ deskId }) => shown.push(deskId));
    act(() => {
      office
        .getState()
        .applySnapshot('pixel', [
          { deskId: 'desk-03', userId: 'user-3', displayName: 'Mary', decor: null },
        ]);
    });
    renderPanel();

    await user.click(screen.getByRole('button', { name: 'Ir al escritorio de Mary' }));
    await user.click(await screen.findByRole('button', { name: 'Ir al escritorio de Zoe' }));

    expect(shown).toEqual(['desk-03', 'desk-05']);
    expect(screen.queryByRole('button', { name: 'Ir al escritorio de Luis' })).toBeNull();
  });

  it('offers "Llamar" to everyone but me', () => {
    renderPanel();

    expect(screen.getByRole('button', { name: 'Llamar a Mary' })).not.toHaveAttribute(
      'aria-disabled',
    );
    expect(screen.queryByRole('button', { name: 'Llamar a Ana' })).toBeNull();
  });

  it('closes with its button', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    renderPanel(onClose);

    await user.click(screen.getByRole('button', { name: 'Cerrar la lista de personas' }));

    expect(onClose).toHaveBeenCalledOnce();
  });
});

describe('RingButton (E7-S5, RN-11)', () => {
  it('rings, then stays disabled with a countdown for 30 s', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: (ms) => vi.advanceTimersByTime(ms) });
    const ring = vi.fn(() => Promise.resolve());
    renderWithProviders(
      <RingButton userId="user-3" displayName="Mary" ring={ring} store={createRingStore()} />,
    );

    await user.click(screen.getByRole('button', { name: 'Llamar a Mary' }));

    expect(ring).toHaveBeenCalledWith('user-3');
    const button = await screen.findByRole('button', {
      name: 'Podrás volver a llamar a Mary en 30 s',
    });
    expect(button).toHaveAttribute('aria-disabled', 'true');
    expect(button).toHaveTextContent('Llamar (30 s)');
    // The button keeps the focus (Escape still closes the panel) and does nothing meanwhile.
    expect(document.activeElement).toBe(button);
    await user.click(button);
    expect(ring).toHaveBeenCalledOnce();
    expect(screen.getByRole('status')).toHaveTextContent('Has llamado a Mary.');

    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    expect(button).toHaveTextContent('Llamar (20 s)');

    act(() => {
      vi.advanceTimersByTime(RING_COOLDOWN_MS - 10_000);
    });
    expect(screen.getByRole('button', { name: 'Llamar a Mary' })).not.toHaveAttribute(
      'aria-disabled',
    );
  });

  it('asks for the notification permission on the first use only', async () => {
    const user = userEvent.setup();
    const requestPermission = vi.fn(() => Promise.resolve('granted' as NotificationPermission));
    vi.stubGlobal('Notification', { permission: 'default', requestPermission });
    renderWithProviders(
      <RingButton userId="user-3" displayName="Mary" ring={() => Promise.resolve()} />,
    );
    expect(requestPermission).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Llamar a Mary' }));

    expect(requestPermission).toHaveBeenCalledOnce();
  });

  it('explains RING_COOLDOWN from the server and starts the countdown', async () => {
    const user = userEvent.setup();
    const ring = vi.fn(() => Promise.reject(new RealtimeRequestError('RING_COOLDOWN', 'wait')));
    renderWithProviders(
      <RingButton userId="user-2" displayName="Luis" ring={ring} store={createRingStore()} />,
    );

    await user.click(screen.getByRole('button', { name: 'Llamar a Luis' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Espera un poco antes de volver a llamar.',
    );
    expect(screen.getByRole('button', { name: /Podrás volver a llamar a Luis/ })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
  });
});
