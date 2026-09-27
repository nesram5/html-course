import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { I18nextProvider } from 'react-i18next';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createI18n } from '@/shared/i18n';

import { PreJoin } from '../components/PreJoin';
import type { CameraPreview, DeviceAccess, MicrophonePreview } from '../lib/devices';
import { loadMediaChoices, type PrefsStorage } from '../lib/media-prefs';
import { createMediaStore, type MediaStore } from '../store/media-store';

function device(kind: MediaDeviceKind, deviceId: string, label: string): MediaDeviceInfo {
  return { kind, deviceId, label, groupId: 'g', toJSON: () => ({}) };
}

class FakeDevices implements DeviceAccess {
  devices: MediaDeviceInfo[] = [
    device('videoinput', 'cam-1', 'Cámara integrada'),
    device('videoinput', 'cam-2', 'Cámara USB'),
    device('audioinput', 'mic-1', 'Micrófono integrado'),
    device('audiooutput', 'spk-1', 'Altavoces'),
  ];
  cameraError: Error | null = null;
  micError: Error | null = null;
  level = 0.5;
  readonly opened: string[] = [];
  readonly stopped: string[] = [];
  readonly attached: HTMLVideoElement[] = [];
  readonly changeListeners = new Set<() => void>();
  listCalls = 0;

  listDevices(): Promise<MediaDeviceInfo[]> {
    this.listCalls++;
    return Promise.resolve(this.devices);
  }

  openCamera(deviceId: string | null): Promise<CameraPreview> {
    const name = `camera:${deviceId ?? 'default'}`;
    this.opened.push(name);
    if (this.cameraError !== null) return Promise.reject(this.cameraError);
    return Promise.resolve({
      attach: (element) => {
        this.attached.push(element);
      },
      detach: () => undefined,
      stop: () => {
        this.stopped.push(name);
      },
    });
  }

  openMicrophone(deviceId: string | null): Promise<MicrophonePreview> {
    const name = `mic:${deviceId ?? 'default'}`;
    this.opened.push(name);
    if (this.micError !== null) return Promise.reject(this.micError);
    return Promise.resolve({
      level: () => this.level,
      stop: () => {
        this.stopped.push(name);
      },
    });
  }

  onDeviceChange(listener: () => void): () => void {
    this.changeListeners.add(listener);
    return () => this.changeListeners.delete(listener);
  }

  canChooseSpeaker(): boolean {
    return true;
  }
}

function memoryStorage(): PrefsStorage {
  const data = new Map<string, string>();
  return {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => {
      data.set(key, value);
    },
  };
}

const SPACE = { spaceId: 'space-1', spaceName: 'Acme', userId: 'user-1', displayName: 'Ana' };
const denied = (): Error => Object.assign(new Error('denied'), { name: 'NotAllowedError' });

let devices: FakeDevices;
let storage: PrefsStorage;
let store: MediaStore;
let onDone: ReturnType<typeof vi.fn<() => void>>;

function renderPreJoin() {
  return render(
    <I18nextProvider i18n={createI18n()}>
      <PreJoin space={SPACE} onDone={onDone} devices={devices} store={store} storage={storage} />
    </I18nextProvider>,
  );
}

beforeEach(() => {
  devices = new FakeDevices();
  storage = memoryStorage();
  store = createMediaStore();
  onDone = vi.fn<() => void>();
});

describe('PreJoin (E5-S4)', () => {
  it('shows my camera preview, the microphone level and the device selectors', async () => {
    renderPreJoin();

    expect(screen.getByRole('dialog', { name: 'Antes de entrar' })).toBeInTheDocument();
    await waitFor(() => {
      expect(devices.attached).toContain(screen.getByLabelText('Vista previa de tu cámara'));
    });
    await waitFor(() => {
      expect(screen.getByRole('meter', { name: 'Nivel del micrófono' })).toHaveAttribute(
        'aria-valuenow',
        '50',
      );
    });
    const camera = screen.getByRole('combobox', { name: 'Cámara' });
    expect(
      within(camera)
        .getAllByRole('option')
        .map((o) => o.textContent),
    ).toEqual(['Predeterminado del sistema', 'Cámara integrada', 'Cámara USB']);
    expect(screen.getByRole('combobox', { name: 'Micrófono' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Altavoz' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Entrar' })).toHaveFocus();
  });

  it('switches the preview to another camera and releases the previous one', async () => {
    const user = userEvent.setup();
    renderPreJoin();
    await waitFor(() => {
      expect(devices.opened).toContain('camera:default');
    });

    await user.selectOptions(screen.getByRole('combobox', { name: 'Cámara' }), 'cam-2');

    await waitFor(() => {
      expect(devices.opened).toContain('camera:cam-2');
    });
    expect(devices.stopped).toContain('camera:default');
  });

  it('remembers the choices for the next visit and hands them to the media', async () => {
    const user = userEvent.setup();
    const { unmount } = renderPreJoin();
    await user.selectOptions(await screen.findByRole('combobox', { name: 'Micrófono' }), 'mic-1');
    await user.click(screen.getByRole('checkbox', { name: 'Cámara activada' }));

    await user.click(screen.getByRole('button', { name: 'Entrar' }));

    expect(onDone).toHaveBeenCalledTimes(1);
    const expected = {
      audioEnabled: true,
      videoEnabled: false,
      audioDeviceId: 'mic-1',
      videoDeviceId: null,
      audioOutputDeviceId: null,
    };
    expect(store.getState().choices).toEqual(expected);
    expect(loadMediaChoices(storage)).toEqual(expected);

    // Another day: the pre-join starts with the same choices.
    unmount();
    renderPreJoin();
    expect(screen.getByRole('checkbox', { name: 'Cámara activada' })).not.toBeChecked();
    await waitFor(() => {
      expect(screen.getByRole('combobox', { name: 'Micrófono' })).toHaveValue('mic-1');
    });
  });

  it('lets me enter without media when the browser refuses, and explains how to allow it', async () => {
    const user = userEvent.setup();
    devices.cameraError = denied();
    devices.micError = denied();
    renderPreJoin();

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('No tenemos permiso para usar tu cámara o tu micrófono');
    expect(alert).toHaveTextContent('icono del candado');
    const enter = screen.getByRole('button', { name: 'Entrar sin cámara ni micrófono' });

    await user.click(enter);

    expect(onDone).toHaveBeenCalled();
    expect(store.getState().choices).toMatchObject({ audioEnabled: false, videoEnabled: false });
    // What the person wanted is still remembered: next time it is tried again.
    expect(loadMediaChoices(storage)).toMatchObject({ audioEnabled: true, videoEnabled: true });
  });

  it('asks the browser again with "Probar de nuevo"', async () => {
    const user = userEvent.setup();
    devices.cameraError = denied();
    renderPreJoin();
    await screen.findByRole('alert');
    devices.cameraError = null;

    await user.click(screen.getByRole('button', { name: 'Probar de nuevo' }));

    await waitFor(() => {
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });
    expect(devices.opened.filter((name) => name === 'camera:default')).toHaveLength(2);
  });

  it('updates the device lists when a device is plugged in', async () => {
    renderPreJoin();
    await screen.findByRole('option', { name: 'Cámara USB' });
    devices.devices = [...devices.devices, device('videoinput', 'cam-3', 'Cámara nueva')];

    for (const listener of devices.changeListeners) listener();

    expect(await screen.findByRole('option', { name: 'Cámara nueva' })).toBeInTheDocument();
  });

  it('releases the camera and the microphone when it closes', async () => {
    const { unmount } = renderPreJoin();
    await waitFor(() => {
      expect(devices.opened).toEqual(expect.arrayContaining(['camera:default', 'mic:default']));
    });

    unmount();

    expect(devices.stopped).toEqual(expect.arrayContaining(['camera:default', 'mic:default']));
    expect(devices.changeListeners.size).toBe(0);
  });
});
