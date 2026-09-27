import type { MeetingRoomDto, WorldMap } from '@bululu/shared';
import { act, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DeskHud } from '@/features/personalization';
import {
  InteractionKeys,
  createOfficeStore,
  createWorldStore,
  officeStore,
  worldEvents,
  worldStore,
  type OfficeStore,
  type WorldStore,
} from '@/features/world';
import { spaceInfoFixture } from '@/test/fixtures';
import { mockApi } from '@/test/mock-api';
import { renderWithProviders } from '@/test/providers';
import { renderApp } from '@/test/render';

import { RoomCard, roomsSpaceExtension } from '..';

const MEET = 'https://meet.google.com/abc-defg-hij';

function room(overrides: Partial<MeetingRoomDto> = {}): MeetingRoomDto {
  return { areaId: 'sala', name: 'Sala', meetUri: MEET, source: 'api', ...overrides };
}

function player(userId: string, roomId: string | null) {
  return {
    userId,
    displayName: userId,
    avatarId: 'avatar-01',
    x: 3,
    y: 0,
    dir: 'down' as const,
    status: 'available' as const,
    away: false,
    roomId,
    inConversation: false,
    reconnecting: false,
  };
}

/** The local person stands at a tile, inside (`roomId`) or outside a meeting room. */
function standIn(store: WorldStore, roomId: string | null, x = 3, y = 0) {
  act(() => {
    store.getState().setLocalPlayer({ x, y, dir: 'down', roomId });
  });
}

const Overlay = roomsSpaceExtension.Overlay!;

describe('room card over the office (E6-S2)', () => {
  let open: ReturnType<typeof vi.fn<typeof window.open>>;

  beforeEach(() => {
    open = vi.fn<typeof window.open>(() => null);
    vi.spyOn(window, 'open').mockImplementation(open);
    officeStore.getState().setRooms([room()]);
    worldStore.getState().applySnapshot({
      v: 1,
      spaceId: 'space-1',
      mapTemplateId: 'office-small@1',
      themeId: 'pixel',
      self: player('user-1', null),
      players: [player('user-2', 'sala'), player('user-3', null)],
      rooms: [room()],
      desks: [],
    });
  });

  afterEach(() => {
    act(() => {
      worldStore.getState().reset();
    });
    officeStore.getState().reset();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('appears on entering a room with the people inside, and goes on leaving it', () => {
    renderWithProviders(<Overlay space={spaceInfoFixture()} />);
    expect(screen.queryByTestId('room-card')).toBeNull();

    standIn(worldStore, 'sala');

    const card = screen.getByRole('region', { name: 'Sala de reuniones' });
    expect(card).toHaveTextContent('Estás en Sala · 2 personas dentro');
    expect(screen.getByRole('button', { name: /Unirse a la reunión/ })).toBeInTheDocument();

    act(() => {
      worldStore.getState().applyDelta({
        moved: [],
        joined: [],
        left: [],
        changed: [{ userId: 'user-3', roomId: 'sala' }],
      });
    });
    expect(card).toHaveTextContent('3 personas dentro');

    standIn(worldStore, null);
    expect(screen.queryByTestId('room-card')).toBeNull();
  });

  it('announces entering and leaving in a live region that is there before (screen readers)', () => {
    renderWithProviders(<Overlay space={spaceInfoFixture()} />);
    const announcer = screen.getByTestId('rooms-announcer');
    expect(announcer).toHaveAttribute('role', 'status');
    expect(announcer).toHaveTextContent('');

    standIn(worldStore, 'sala');
    expect(screen.getByTestId('rooms-announcer')).toBe(announcer);
    expect(announcer).toHaveTextContent(
      'Has entrado en Sala. Tu micrófono y tu cámara de Plaza están apagados',
    );

    standIn(worldStore, null);
    expect(announcer).toHaveTextContent('Has salido de Sala.');
  });

  it('opens the Meet in a new tab without opener and records room_meet_opened', async () => {
    const api = mockApi({ 'POST /api/spaces/space-1/events': { status: 204 } });
    const user = userEvent.setup();
    renderWithProviders(<Overlay space={spaceInfoFixture()} />);
    standIn(worldStore, 'sala');

    await user.click(screen.getByRole('button', { name: /Unirse a la reunión/ }));

    expect(open).toHaveBeenCalledWith(MEET, '_blank', 'noopener,noreferrer');
    await waitFor(() => {
      expect(api.callsTo('POST /api/spaces/space-1/events').map((call) => call.body)).toEqual([
        { name: 'room_meet_opened', props: { areaId: 'sala' } },
      ]);
    });
  });

  it('joins with X too', async () => {
    mockApi({ 'POST /api/spaces/space-1/events': { status: 204 } });
    const user = userEvent.setup();
    renderWithProviders(<Overlay space={spaceInfoFixture()} />);
    standIn(worldStore, 'sala');
    expect(screen.getByRole('button', { name: /Unirse a la reunión/ })).toHaveAttribute(
      'aria-keyshortcuts',
      'x',
    );

    await user.keyboard('x');

    expect(open).toHaveBeenCalledTimes(1);
  });

  it('tells the media feature the person is in a room, and when they leave or close the office', () => {
    const signals: boolean[] = [];
    const off = worldEvents.on('media:self-in-room', ({ inRoom }) => signals.push(inRoom));
    const { unmount } = renderWithProviders(<Overlay space={spaceInfoFixture()} />);

    standIn(worldStore, 'sala');
    standIn(worldStore, 'sala', 4, 0); // walking inside the room says nothing new
    standIn(worldStore, null);
    standIn(worldStore, 'sala');
    unmount();

    expect(signals).toEqual([true, false, true, false]);
    off();
  });

  it('says when the room has no Meet link, and offers the owner to add it', () => {
    officeStore.getState().setRooms([room({ meetUri: null, source: null })]);
    const { unmount } = renderWithProviders(
      <Overlay space={spaceInfoFixture({ isOwner: true })} />,
    );
    standIn(worldStore, 'sala');

    expect(screen.getByRole('region', { name: 'Sala de reuniones' })).toHaveTextContent(
      'Esta sala aún no tiene enlace de Meet.',
    );
    const link = screen.getByRole('link', { name: 'Añadir el enlace de Meet' });
    expect(link).toHaveAttribute('href', '/spaces/space-1/settings#salas');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    expect(screen.queryByRole('button', { name: /Unirse/ })).toBeNull();
    unmount();

    renderWithProviders(<Overlay space={spaceInfoFixture({ isOwner: false })} />);
    expect(screen.getByRole('region', { name: 'Sala de reuniones' })).toHaveTextContent(
      'Pide a quien administra el espacio que lo añada.',
    );
    expect(screen.queryByRole('link')).toBeNull();
  });

  it('shows the link as soon as the owner adds it (room:updated)', () => {
    officeStore.getState().setRooms([room({ meetUri: null, source: null })]);
    renderWithProviders(<Overlay space={spaceInfoFixture()} />);
    standIn(worldStore, 'sala');
    expect(screen.queryByRole('button', { name: /Unirse/ })).toBeNull();

    act(() => {
      officeStore.getState().applyRoom(room({ source: 'manual' }));
    });

    expect(screen.getByRole('button', { name: /Unirse a la reunión/ })).toBeInTheDocument();
  });
});

describe('the interaction key between a meeting room and a desk', () => {
  /** A desk right inside the room: both could answer X. */
  const MAP: WorldMap = {
    width: 6,
    height: 4,
    collisionGrid: new Uint8Array(24),
    rooms: [{ x: 0, y: 0, width: 6, height: 4, areaId: 'sala', name: 'Sala' }],
    spawns: [{ x: 0, y: 3 }],
    desks: [{ deskId: 'desk-01', x: 2, y: 1, width: 2, height: 1, decorSlots: [] }],
  };
  let world: WorldStore;
  let office: OfficeStore;

  beforeEach(() => {
    world = createWorldStore();
    office = createOfficeStore();
    office.getState().setRooms([room()]);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('X joins the meeting and does not also open the desk menu', async () => {
    mockApi({
      'GET /api/decor': { body: { items: [] } },
      'POST /api/spaces/space-1/events': { status: 204 },
    });
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    const keys = new InteractionKeys();
    const openMeet = vi.fn();
    renderApp({
      route: '/s/acme',
      routes: [
        {
          path: '/s/:slug',
          element: (
            <>
              <DeskHud
                spaceId="space-1"
                map={MAP}
                selfUserId="user-1"
                world={world}
                office={office}
                keys={keys}
              />
              <RoomCard
                spaceId="space-1"
                roomId="sala"
                roomName="Sala"
                isOwner={false}
                world={world}
                office={office}
                keys={keys}
                openMeet={openMeet}
              />
            </>
          ),
        },
      ],
    });
    const user = userEvent.setup();
    standIn(world, 'sala', 2, 2);
    // The desk hint is there, but X belongs to the meeting.
    expect(screen.getByRole('button', { name: /^Escritorio/ })).not.toHaveAttribute(
      'aria-keyshortcuts',
    );

    await user.keyboard('x');

    expect(openMeet).toHaveBeenCalledTimes(1);
    expect(open).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
