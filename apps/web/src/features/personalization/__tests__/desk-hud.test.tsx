import type { DecorItemDto, DeskState, WorldMap } from '@plaza/shared';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { I18nextProvider } from 'react-i18next';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createOfficeStore,
  createWorldStore,
  InteractionKeys,
  type OfficeStore,
  type WorldStore,
} from '@/features/world';
import { createI18n } from '@/shared/i18n';
import { useToastStore } from '@/shared/ui';
import { mockApi, type MockRoute } from '@/test/mock-api';
import { renderApp } from '@/test/render';

import { DeskHud } from '../components/DeskHud';
import { DeskMenu } from '../components/DeskMenu';

const ITEMS = [
  'plant',
  'lamp',
  'mug',
  'frame',
  'trophy',
  'cat',
  'books',
  'globe',
  'cactus',
  'radio',
  'clock',
  'flag',
  'donut',
  'headphones',
];
const NAMES: Record<string, string> = { plant: 'Planta', lamp: 'Lámpara', cat: 'Gato' };
const CATALOG: DecorItemDto[] = ITEMS.map((id) => ({
  id,
  name: NAMES[id] ?? id,
  spriteUrl: `/assets/maps/decor/${id}.png`,
}));

function slots(x: number, y: number) {
  return [0, 1, 2].map((i) => ({ x: x * 32 + 8 + i * 8, y: y * 32 + 16 }));
}

/** Two desks in a 10×4 room: desk-01 (2..3, 1) and desk-02 (6, 1). */
const MAP: WorldMap = {
  width: 10,
  height: 4,
  collisionGrid: new Uint8Array(40),
  rooms: [],
  spawns: [{ x: 0, y: 3 }],
  desks: [
    { deskId: 'desk-01', x: 2, y: 1, width: 2, height: 1, decorSlots: slots(2, 1) },
    { deskId: 'desk-02', x: 6, y: 1, width: 1, height: 1, decorSlots: slots(6, 1) },
  ],
};

function desk(deskId: string, userId: string, displayName: string): DeskState {
  return { deskId, userId, displayName, decor: null };
}

let world: WorldStore;
let office: OfficeStore;

function setup(routes: Record<string, MockRoute> = {}, keys?: InteractionKeys) {
  const api = mockApi({ 'GET /api/decor': { body: { items: CATALOG } }, ...routes });
  renderApp({
    route: '/s/acme',
    routes: [
      {
        path: '/s/:slug',
        element: (
          <DeskHud
            spaceId="space-1"
            map={MAP}
            selfUserId="user-1"
            world={world}
            office={office}
            {...(keys !== undefined && { keys })}
          />
        ),
      },
    ],
  });
  return api;
}

function standAt(x: number, y: number) {
  act(() => {
    world.getState().setLocalPlayer({ x, y, dir: 'up', roomId: null });
  });
}

beforeEach(() => {
  world = createWorldStore();
  office = createOfficeStore();
});

afterEach(() => {
  vi.unstubAllGlobals();
  useToastStore.setState({ toasts: [] });
});

describe('desk menu with X (E9-S2)', () => {
  it('appears only next to a desk and opens with X', async () => {
    setup();
    const user = userEvent.setup();
    standAt(8, 3);
    expect(screen.queryByRole('button', { name: /Escritorio/ })).toBeNull();

    standAt(2, 2);
    expect(screen.getByRole('button', { name: /^Escritorio \(tecla X\)/ })).toBeInTheDocument();
    await user.keyboard('x');

    const menu = screen.getByRole('dialog', { name: 'Escritorio libre' });
    expect(within(menu).getByRole('button', { name: 'Reclamar este escritorio' })).toHaveFocus();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('gives the focus back to the hint button after a menu it opened closes', async () => {
    setup();
    const user = userEvent.setup();
    standAt(2, 2);

    await user.click(screen.getByRole('button', { name: /^Escritorio \(tecla X\)/ }));
    expect(screen.getByRole('dialog', { name: 'Escritorio libre' })).toBeInTheDocument();
    await user.keyboard('{Escape}');

    expect(screen.getByRole('button', { name: /^Escritorio \(tecla X\)/ })).toHaveFocus();
  });

  it('leaves X and its hint to a meeting room that outranks the desk (E6)', async () => {
    const keys = new InteractionKeys();
    const joinMeet = vi.fn();
    const withdraw = keys.register({ id: 'meeting-room', priority: 20, run: joinMeet });
    setup({}, keys);
    const user = userEvent.setup();
    standAt(2, 2);

    const hint = screen.getByRole('button', {
      name: 'Escritorio: reclamar, decorar o ver de quién es',
    });
    expect(hint).not.toHaveAttribute('aria-keyshortcuts');
    await user.keyboard('x');
    expect(joinMeet).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('dialog')).toBeNull();

    act(() => {
      withdraw();
    });
    expect(screen.getByRole('button', { name: /^Escritorio \(tecla X\)/ })).toHaveAttribute(
      'aria-keyshortcuts',
      'x',
    );
  });

  it('ignores X typed in a text field', async () => {
    setup();
    const user = userEvent.setup();
    standAt(2, 2);
    const input = document.createElement('input');
    document.body.append(input);

    await user.type(input, 'x');

    expect(screen.queryByRole('dialog')).toBeNull();
    input.remove();
  });

  it('claims a free desk', async () => {
    const api = setup({
      'PUT /api/spaces/space-1/desks/desk-01': {
        body: { desk: desk('desk-01', 'user-1', 'Ana') },
      },
    });
    const user = userEvent.setup();
    standAt(2, 2);

    await user.keyboard('x');
    await user.click(screen.getByRole('button', { name: 'Reclamar este escritorio' }));

    await waitFor(() => {
      expect(api.callsTo('PUT /api/spaces/space-1/desks/desk-01').map((c) => c.body)).toEqual([{}]);
    });
    expect(await screen.findByText('Este escritorio ya es tuyo.')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('asks before replacing my current desk (RN-13)', async () => {
    const api = setup({
      'PUT /api/spaces/space-1/desks/desk-01': {
        body: { desk: desk('desk-01', 'user-1', 'Ana') },
      },
    });
    act(() => {
      office.getState().applyDesk(desk('desk-02', 'user-1', 'Ana'));
    });
    const user = userEvent.setup();
    standAt(2, 2);

    await user.keyboard('x');
    await user.click(screen.getByRole('button', { name: 'Reclamar este escritorio' }));

    const confirm = screen.getByRole('dialog', { name: '¿Cambiar de escritorio?' });
    expect(api.callsTo('PUT /api/spaces/space-1/desks/desk-01')).toHaveLength(0);
    const change = within(confirm).getByRole('button', { name: 'Cambiar a este escritorio' });
    expect(change).toHaveFocus();
    await user.click(change);

    await waitFor(() => {
      expect(api.callsTo('PUT /api/spaces/space-1/desks/desk-01')).toHaveLength(1);
    });
  });

  it("shows the owner of someone else's desk, without Decorar", async () => {
    setup();
    act(() => {
      office.getState().applyDesk(desk('desk-02', 'user-2', 'Luis'));
    });
    const user = userEvent.setup();
    standAt(6, 2);

    await user.keyboard('x');

    const menu = screen.getByRole('dialog', { name: 'Escritorio de Luis' });
    expect(within(menu).queryByRole('button', { name: 'Decorar' })).toBeNull();
    expect(within(menu).queryByRole('button', { name: 'Reclamar este escritorio' })).toBeNull();
  });

  it('closes the menu when walking away from the desk', async () => {
    setup();
    const user = userEvent.setup();
    standAt(2, 2);
    await user.keyboard('x');
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    standAt(8, 3);

    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

describe('"Decorar" (E9-S3)', () => {
  async function openPanel(routes: Record<string, MockRoute> = {}) {
    const api = setup(routes);
    act(() => {
      office.getState().applyDesk({
        ...desk('desk-02', 'user-1', 'Ana'),
        decor: { slots: [null, 'lamp', null] },
      });
    });
    const user = userEvent.setup();
    standAt(6, 2);
    await user.keyboard('x');
    await user.click(screen.getByRole('button', { name: 'Decorar' }));
    const panel = screen.getByRole('dialog', { name: 'Decorar mi escritorio' });
    await within(panel).findByRole('button', { name: 'Planta' });
    return { api, user, panel };
  }

  it('shows the catalog (at least 12 objects, each with a name) and the 3 slots', async () => {
    const { panel } = await openPanel();

    const catalog = within(panel).getByRole('group', { name: 'Objetos para el hueco 1' });
    expect(within(catalog).getAllByRole('button').length).toBeGreaterThanOrEqual(12);
    const slotGroup = within(panel).getByRole('group', { name: 'Huecos de la mesa' });
    expect(within(slotGroup).getByRole('button', { name: 'Hueco 1: vacío' })).toHaveFocus();
    expect(within(slotGroup).getByRole('button', { name: 'Hueco 2: Lámpara' })).toBeInTheDocument();
    expect(within(slotGroup).getByRole('button', { name: 'Hueco 3: vacío' })).toBeInTheDocument();
  });

  it('previews the choice on the desk live and saves it with the keyboard', async () => {
    const { api, user, panel } = await openPanel({
      'PATCH /api/spaces/space-1/desks/desk-02/decor': ({ body }) => ({
        body: { desk: { ...desk('desk-02', 'user-1', 'Ana'), decor: body } },
      }),
    });

    // Slot 1 has the focus: Enter selects it, Tab moves on through the slots to the objects
    // ("Vaciar hueco 1" is disabled while the slot is empty).
    await user.keyboard('{Enter}');
    await user.tab();
    await user.tab();
    await user.tab();
    expect(within(panel).getByRole('button', { name: 'Planta' })).toHaveFocus();
    await user.keyboard('{Enter}');

    expect(office.getState().preview).toEqual({
      deskId: 'desk-02',
      decor: { slots: ['plant', 'lamp', null] },
    });
    expect(within(panel).getByRole('button', { name: 'Hueco 1: Planta' })).toBeInTheDocument();

    await user.click(within(panel).getByRole('button', { name: 'Guardar' }));

    await waitFor(() => {
      expect(
        api.callsTo('PATCH /api/spaces/space-1/desks/desk-02/decor').map((c) => c.body),
      ).toEqual([{ slots: ['plant', 'lamp', null] }]);
    });
    expect(await screen.findByText('Tu escritorio está decorado.')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(office.getState().preview).toBeNull();
  });

  it('empties a slot and discards the preview on Escape', async () => {
    const { user, panel } = await openPanel();

    await user.click(within(panel).getByRole('button', { name: 'Hueco 2: Lámpara' }));
    await user.click(within(panel).getByRole('button', { name: 'Vaciar hueco 2' }));
    expect(office.getState().preview?.decor.slots).toEqual([null, null, null]);

    await user.keyboard('{Escape}');

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(office.getState().preview).toBeNull();
    expect(office.getState().desks['desk-02']?.decor).toEqual({ slots: [null, 'lamp', null] });
  });

  it('keeps the arrow keys away from the map while choosing', async () => {
    const { user } = await openPanel();
    const walked = vi.fn();
    window.addEventListener('keydown', walked);

    await user.keyboard('{ArrowUp}{ArrowLeft}');

    expect(walked).not.toHaveBeenCalled();
    window.removeEventListener('keydown', walked);
  });
});

describe('DeskMenu while a request is in flight', () => {
  it('keeps the focus on the pressed button and ignores more presses', async () => {
    const i18n = createI18n();
    const onClaim = vi.fn();
    const menu = (busy: boolean) => (
      <I18nextProvider i18n={i18n}>
        <DeskMenu
          deskId="desk-1"
          holder={null}
          myDeskId={null}
          busy={busy}
          onClaim={onClaim}
          onRelease={vi.fn()}
          onDecorate={vi.fn()}
          onClose={vi.fn()}
        />
      </I18nextProvider>
    );
    const view = render(menu(false));
    const claim = screen.getByRole('button', { name: 'Reclamar este escritorio' });
    const user = userEvent.setup();
    await user.click(claim);

    view.rerender(menu(true));

    expect(claim).toHaveAttribute('aria-disabled', 'true');
    expect(document.activeElement).toBe(claim);
    await user.click(claim);
    expect(onClaim).toHaveBeenCalledOnce();
  });
});
