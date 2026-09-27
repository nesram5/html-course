import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { I18nextProvider } from 'react-i18next';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createI18n } from '@/shared/i18n';

import { MediaControls } from '../components/MediaControls';
import type { MediaController } from '../controller/media-controller';
import type { DeviceAccess } from '../lib/devices';
import { DEFAULT_MEDIA_CHOICES, loadMediaChoices } from '../lib/media-prefs';
import { testController, type FakeRoom } from './fake-room';

function device(kind: MediaDeviceKind, deviceId: string, label: string): MediaDeviceInfo {
  return { kind, deviceId, label, groupId: '', toJSON: () => ({}) };
}

function fakeDevices(canChoose = true): DeviceAccess & { plug: (d: MediaDeviceInfo) => void } {
  let devices = [
    device('audioinput', 'mic-1', 'Micrófono'),
    device('audiooutput', 'spk-1', 'Altavoces del portátil'),
    device('audiooutput', 'spk-2', 'Auriculares USB'),
  ];
  const listeners = new Set<() => void>();
  return {
    listDevices: () => Promise.resolve(devices),
    openCamera: () => Promise.reject(new Error('unused')),
    openMicrophone: () => Promise.reject(new Error('unused')),
    onDeviceChange: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    canChooseSpeaker: () => canChoose,
    plug: (added) => {
      devices = [...devices, added];
      for (const listener of listeners) listener();
    },
  };
}

let controller: MediaController;
let rooms: FakeRoom[];

beforeEach(async () => {
  ({ controller, rooms } = testController());
  controller.store.getState().setChoices(DEFAULT_MEDIA_CHOICES);
  controller.start('space-1', DEFAULT_MEDIA_CHOICES);
  await waitFor(() => {
    expect(controller.store.getState().connection).toBe('connected');
  });
});

afterEach(() => {
  controller.stop();
  localStorage.clear();
});

function renderControls(devices: DeviceAccess) {
  return render(
    <I18nextProvider i18n={createI18n()}>
      <MediaControls controller={controller} devices={devices} />
    </I18nextProvider>,
  );
}

describe('speaker switch in the bottom bar (E5 follow-up)', () => {
  it('changes the speaker during the call, from the keyboard, and remembers it', async () => {
    const user = userEvent.setup();
    const devices = fakeDevices();
    renderControls(devices);
    const speaker = await screen.findByRole('button', { name: 'Altavoz: predeterminado' });
    expect(speaker).toHaveAttribute('aria-expanded', 'false');

    speaker.focus();
    await user.keyboard('{Enter}');
    const dialog = screen.getByRole('dialog', { name: 'Elegir altavoz' });
    const select = within(dialog).getByLabelText('Altavoz');
    expect(select).toHaveFocus();
    await user.selectOptions(select, 'spk-2');

    await waitFor(() => {
      expect(rooms.at(-1)?.switchedDevices).toEqual([['audiooutput', 'spk-2']]);
    });
    expect(controller.store.getState().choices?.audioOutputDeviceId).toBe('spk-2');
    expect(loadMediaChoices().audioOutputDeviceId).toBe('spk-2');

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Altavoz: Auriculares USB' })).toHaveFocus();

    // Back to the system default.
    await user.click(screen.getByRole('button', { name: 'Altavoz: Auriculares USB' }));
    await user.selectOptions(screen.getByLabelText('Altavoz'), '');
    await waitFor(() => {
      expect(rooms.at(-1)?.switchedDevices.at(-1)).toEqual(['audiooutput', 'default']);
    });
  });

  it('lists speakers plugged in during the call', async () => {
    const user = userEvent.setup();
    const devices = fakeDevices();
    renderControls(devices);

    await user.click(await screen.findByRole('button', { name: /^Altavoz/ }));
    devices.plug(device('audiooutput', 'spk-3', 'Altavoz Bluetooth'));

    expect(await screen.findByRole('option', { name: 'Altavoz Bluetooth' })).toBeInTheDocument();
  });

  it('is hidden where the browser cannot choose the speaker', () => {
    renderControls(fakeDevices(false));

    expect(screen.queryByRole('button', { name: /^Altavoz/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Silenciar micrófono' })).toBeInTheDocument();
  });

  it('says so when the speaker cannot be used', async () => {
    const room = rooms.at(-1);
    if (room === undefined) throw new Error('no room');
    room.switchError = new Error('NotFoundError');

    await controller.setAudioOutput('gone');

    expect(controller.store.getState().deviceProblem).toBe('unavailable');
  });
});
