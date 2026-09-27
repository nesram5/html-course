import { PROTOCOL_VERSION, type PublicPlayer } from '@bululu/shared';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RoomEvent, VideoQuality } from 'livekit-client';
import type { ReactNode } from 'react';
import { I18nextProvider } from 'react-i18next';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { presenceStore } from '@/features/presence';
import { worldStore, type EventBus } from '@/features/world';
import { createI18n } from '@/shared/i18n';
import { spaceInfoFixture } from '@/test/fixtures';

import { HallwayNotice } from '../components/HallwayNotice';
import { MediaControls } from '../components/MediaControls';
import { MediaLayer } from '../components/MediaLayer';
import type { MediaController } from '../controller/media-controller';
import { DEFAULT_MEDIA_CHOICES } from '../lib/media-prefs';
import { videoOpacity } from '../lib/video-opacity';
import { testController, type FakeRealtime, type FakeRoom } from './fake-room';

const SPACE = spaceInfoFixture();

function player(userId: string, displayName: string, x: number, y: number): PublicPlayer {
  return {
    userId,
    displayName,
    avatarId: 'avatar-01',
    x,
    y,
    dir: 'down',
    status: 'available',
    away: false,
    roomId: null,
    inConversation: true,
    reconnecting: false,
  };
}

let controller: MediaController;
let realtime: FakeRealtime;
let rooms: FakeRoom[];
let events: EventBus;

function room(): FakeRoom {
  const last = rooms.at(-1);
  if (last === undefined) throw new Error('no room');
  return last;
}

function wrap(children: ReactNode) {
  return <I18nextProvider i18n={createI18n()}>{children}</I18nextProvider>;
}

/** The office media as the page mounts it: the layer over the map and the bar controls. */
async function renderOffice() {
  controller.store.getState().setChoices(DEFAULT_MEDIA_CHOICES);
  const result = render(
    wrap(
      <>
        <MediaLayer space={SPACE} controller={controller} />
        <MediaControls controller={controller} />
      </>,
    ),
  );
  await waitFor(() => {
    expect(controller.store.getState().connection).toBe('connected');
  });
  return result;
}

beforeEach(() => {
  window.localStorage.clear();
  ({ controller, realtime, rooms, events } = testController());
  worldStore.getState().setLocalPlayer({ x: 5, y: 5, dir: 'down', roomId: null });
  worldStore.getState().applySnapshot({
    v: PROTOCOL_VERSION,
    spaceId: 'space-1',
    mapTemplateId: 'office-small@1',
    themeId: 'pixel',
    self: player('user-1', 'Ana', 5, 5),
    players: [player('user-2', 'Luis', 6, 5), player('user-3', 'Eva', 5, 8.5)],
    rooms: [],
    desks: [],
  });
});

afterEach(() => {
  controller.stop();
  worldStore.getState().reset();
  presenceStore.getState().reset();
});

describe('VideoStrip (E5-S6)', () => {
  it('covers the video of someone away with "Ausente · Llamar" from presence (E7-S1, E7-S5)', async () => {
    const user = userEvent.setup();
    await renderOffice();
    room().addParticipant('user-2', 'Luis');
    room().addParticipant('user-3', 'Eva');
    act(() => {
      realtime.peers('user-2', 'user-3');
      presenceStore.getState().applySnapshot({
        v: PROTOCOL_VERSION,
        spaceId: 'space-1',
        mapTemplateId: 'office-small@1',
        themeId: 'pixel',
        self: player('user-1', 'Ana', 5, 5),
        players: [{ ...player('user-2', 'Luis', 6, 5), away: true }, player('user-3', 'Eva', 5, 7)],
        rooms: [],
        desks: [],
      });
    });

    const [, luis, eva] = screen.getAllByTestId('hallway-video');
    const card = within(luis!).getByRole('group', { name: 'Luis está ausente' });
    expect(card).toHaveTextContent('Ausente');
    const ring = within(card).getByRole('button', { name: /Llamar/ });
    // The card is not inside the enlarge button (no nested buttons).
    expect(within(luis!).getByRole('button', { name: /Ampliar/ })).not.toContainElement(ring);
    // Eva is here: her tile has no card and stays clickable.
    expect(within(eva!).queryByRole('group')).toBeNull();
    expect(within(eva!).getByTestId('hallway-video-cover')).toBeEmptyDOMElement();

    // Luis comes back: the card goes away.
    act(() => {
      presenceStore.getState().applyDelta({
        moved: [],
        joined: [],
        left: [],
        changed: [{ userId: 'user-2', away: false }],
      });
    });
    expect(within(luis!).queryByRole('group', { name: 'Luis está ausente' })).toBeNull();
    await user.click(within(luis!).getByRole('button', { name: /Ampliar/ }));
  });

  it('shows a video per hallway peer with name and microphone indicator, plus my own', async () => {
    await renderOffice();
    const luis = room().addParticipant('user-2', 'Luis (LiveKit)');
    const eva = room().addParticipant('user-3', 'Eva');
    eva.mic.isMuted = true;

    act(() => {
      realtime.peers('user-2', 'user-3');
    });

    const strip = screen.getByRole('region', { name: 'Personas con las que hablas' });
    const tiles = within(strip).getAllByTestId('hallway-video');
    expect(tiles.map((tile) => tile.dataset.userId)).toEqual(['self', 'user-2', 'user-3']);
    // Names come from the office (current display name).
    expect(within(tiles[1]!).getByText('Luis')).toBeInTheDocument();
    expect(
      within(tiles[2]!).getByRole('img', { name: 'Micrófono silenciado' }),
    ).toBeInTheDocument();
    expect(within(tiles[1]!).queryByRole('img', { name: 'Micrófono silenciado' })).toBeNull();
    expect(luis.camera.videoTrack?.attached.size).toBe(1);
  });

  it('fades the video of someone near the edge of the conversation', async () => {
    await renderOffice();
    room().addParticipant('user-2');
    room().addParticipant('user-3');
    act(() => {
      realtime.peers('user-2', 'user-3');
    });

    const [, luis, eva] = screen.getAllByTestId('hallway-video');
    expect(luis).toHaveStyle({ opacity: '1' });
    expect(Number(eva!.style.opacity)).toBeCloseTo(videoOpacity(3.5));
    expect(Number(eva!.style.opacity)).toBeLessThan(1);

    // Eva walks away: her video becomes more transparent before the server cuts it.
    act(() => {
      worldStore.getState().applyDelta({
        moved: [{ userId: 'user-3', x: 5, y: 9, dir: 'down' }],
        joined: [],
        left: [],
        changed: [],
      });
    });
    expect(Number(eva!.style.opacity)).toBeCloseTo(videoOpacity(4));
  });

  it('highlights who is speaking', async () => {
    await renderOffice();
    const luis = room().addParticipant('user-2');
    act(() => {
      realtime.peers('user-2');
    });

    luis.isSpeaking = true;
    act(() => {
      room().emit(RoomEvent.ActiveSpeakersChanged, [luis]);
    });

    const tile = screen.getAllByTestId('hallway-video')[1]!;
    expect(tile).toHaveAttribute('data-speaking', 'true');
    expect(within(tile).getByText('Hablando')).toBeInTheDocument();
  });

  it('enlarges a video on click (high simulcast layer) and shrinks it back', async () => {
    const user = userEvent.setup();
    await renderOffice();
    const luis = room().addParticipant('user-2');
    const eva = room().addParticipant('user-3');
    act(() => {
      realtime.peers('user-2', 'user-3');
    });

    await user.click(screen.getByRole('button', { name: 'Ampliar el vídeo de Luis' }));

    expect(screen.getByRole('button', { name: 'Reducir el vídeo de Luis' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(luis.camera.quality).toBe(VideoQuality.HIGH);
    expect(eva.camera.quality).toBe(VideoQuality.LOW);
    await user.keyboard('{Enter}');
    expect(controller.store.getState().focused).toBeNull();
  });

  it('measures the time to the first frame when the video loads', async () => {
    await renderOffice();
    room().addParticipant('user-2');
    act(() => {
      realtime.peers('user-2');
    });
    const tile = screen.getAllByTestId('hallway-video')[1]!;

    fireEvent(within(tile).getByTestId('hallway-video-element'), new Event('loadeddata'));

    expect(controller.store.getState().firstFrameMs).toHaveLength(1);
  });

  it('offers to enable the sound when the browser blocks it', async () => {
    const user = userEvent.setup();
    await renderOffice();
    room().addParticipant('user-2');
    act(() => {
      realtime.peers('user-2');
    });

    room().canPlaybackAudio = false;
    act(() => {
      room().emit(RoomEvent.AudioPlaybackStatusChanged);
    });
    await user.click(screen.getByRole('button', { name: 'Activar el sonido' }));

    expect(screen.queryByRole('button', { name: 'Activar el sonido' })).toBeNull();
  });

  it('shows nothing when nobody is near, and stops the media on leaving', async () => {
    const { unmount } = await renderOffice();
    expect(screen.queryAllByTestId('hallway-video')).toEqual([]);

    unmount();

    expect(room().disconnects).toBe(1);
    expect(controller.store.getState().connection).toBe('idle');
  });
});

describe('MediaControls (E5-S6)', () => {
  it('mutes and unmutes with accessible buttons', async () => {
    const user = userEvent.setup();
    await renderOffice();

    await user.click(screen.getByRole('button', { name: 'Silenciar micrófono' }));
    await user.click(screen.getByRole('button', { name: 'Apagar cámara' }));

    expect(screen.getByRole('button', { name: 'Activar micrófono' })).toHaveAttribute(
      'aria-keyshortcuts',
      'Control+D Meta+D',
    );
    expect(screen.getByRole('button', { name: 'Encender cámara' })).toBeInTheDocument();
    expect(room().localParticipant.isMicrophoneEnabled).toBe(false);
    expect(room().localParticipant.isCameraEnabled).toBe(false);
  });

  it('toggles with Ctrl+D and Ctrl+E (⌘ on macOS), and no other combination', async () => {
    const user = userEvent.setup();
    await renderOffice();

    await user.keyboard('{Control>}d{/Control}');
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Activar micrófono' })).toBeInTheDocument();
    });
    await user.keyboard('{Meta>}e{/Meta}');
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Encender cámara' })).toBeInTheDocument();
    });
    await user.keyboard('{Control>}{Shift>}d{/Shift}{/Control}');
    await user.keyboard('d');
    expect(screen.getByRole('button', { name: 'Activar micrófono' })).toBeInTheDocument();
  });

  it('says why the media are muted while away', async () => {
    await renderOffice();

    act(() => {
      controller.store.getState().patch({ awayMuted: true });
    });

    expect(screen.getByRole('status')).toHaveTextContent('Te silenciamos mientras estás ausente');
  });
});

describe('MediaControls inside a meeting room (E6-S2)', () => {
  it('turns off and disables microphone and camera, says why, and restores them outside', async () => {
    const user = userEvent.setup();
    await renderOffice();

    act(() => {
      events.emit('media:self-in-room', { inRoom: true });
    });

    const mic = await screen.findByRole('button', { name: 'Activar micrófono' });
    const camera = screen.getByRole('button', { name: 'Encender cámara' });
    // aria-disabled, not disabled: a focused button keeps the focus (WCAG 2.4.3).
    expect(mic).toHaveAttribute('aria-disabled', 'true');
    expect(camera).toHaveAttribute('aria-disabled', 'true');
    expect(mic).toHaveAttribute(
      'title',
      'En la sala tu micrófono y tu cámara de Bululu están apagados: la reunión es en Meet',
    );
    await user.click(mic);
    await user.keyboard('{Control>}d{/Control}');
    expect(room().localParticipant.isMicrophoneEnabled).toBe(false);

    act(() => {
      events.emit('media:self-in-room', { inRoom: false });
    });
    expect(await screen.findByRole('button', { name: 'Silenciar micrófono' })).not.toHaveAttribute(
      'aria-disabled',
    );
    expect(screen.getByRole('button', { name: 'Apagar cámara' })).not.toHaveAttribute(
      'aria-disabled',
    );
  });

  it('keeps the focus on the microphone button when walking into a room', async () => {
    await renderOffice();
    const mic = await screen.findByRole('button', { name: 'Silenciar micrófono' });
    mic.focus();

    act(() => {
      events.emit('media:self-in-room', { inRoom: true });
    });

    await screen.findByRole('button', { name: 'Activar micrófono' });
    expect(document.activeElement).toBe(mic);
  });
});

describe('HallwayNotice (RN-12)', () => {
  it('waits while the person is inside a meeting room (the room card takes the top)', () => {
    const view = render(wrap(<HallwayNotice inRoom />));
    expect(screen.queryByRole('note')).toBeNull();
    view.rerender(wrap(<HallwayNotice inRoom={false} />));
    expect(screen.getByRole('note')).toBeInTheDocument();
  });

  it('warns on first use that the hallway is not private, until acknowledged', async () => {
    const user = userEvent.setup();
    const first = render(wrap(<HallwayNotice />));
    expect(screen.getByRole('note')).toHaveTextContent(
      'Las charlas de pasillo no son privadas; para hablar en privado, entra en una sala',
    );

    await user.click(screen.getByRole('button', { name: 'Entendido' }));
    expect(screen.queryByRole('note')).toBeNull();
    first.unmount();

    render(wrap(<HallwayNotice />));
    expect(screen.queryByRole('note')).toBeNull();
  });
});
