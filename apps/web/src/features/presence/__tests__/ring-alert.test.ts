import { describe, expect, it, vi } from 'vitest';

import {
  canAskNotificationPermission,
  requestNotificationPermissionOnce,
  showRingAlert,
  type RingAlertEnv,
} from '../lib/ring-alert';

class FakeNotification {
  static permission: NotificationPermission = 'granted';
  static readonly shown: FakeNotification[] = [];
  static requestPermission = vi.fn(() => Promise.resolve<NotificationPermission>('granted'));
  onclick: (() => void) | null = null;
  close = vi.fn();

  constructor(
    readonly title: string,
    readonly options: NotificationOptions,
  ) {
    FakeNotification.shown.push(this);
  }
}

class FakeAudioContext {
  static readonly created: FakeAudioContext[] = [];
  readonly currentTime = 0;
  readonly destination = {};
  readonly oscillators: { frequency: { value: number } }[] = [];

  constructor() {
    FakeAudioContext.created.push(this);
  }

  createGain() {
    return {
      connect: vi.fn(),
      gain: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() },
    };
  }

  createOscillator() {
    const oscillator = { frequency: { value: 0 }, connect: vi.fn(), start: vi.fn(), stop: vi.fn() };
    this.oscillators.push(oscillator);
    return oscillator;
  }

  close() {
    return Promise.resolve();
  }
}

function env(permission: NotificationPermission): RingAlertEnv & { focusWindow: () => void } {
  FakeNotification.permission = permission;
  FakeNotification.shown.length = 0;
  FakeNotification.requestPermission.mockClear();
  FakeAudioContext.created.length = 0;
  return {
    Notification: FakeNotification as unknown as typeof Notification,
    AudioContext: FakeAudioContext as unknown as typeof AudioContext,
    focusWindow: vi.fn(),
  };
}

const TEXTS = { title: 'Sam te está llamando', body: 'Vuelve a Bululu para hablar.' };

describe('showRingAlert (E7-S5)', () => {
  it('rings and shows "Sam te está llamando"; clicking it brings the tab back', () => {
    const browser = env('granted');

    showRingAlert({ fromUserId: 'sam', fromDisplayName: 'Sam', silent: false }, TEXTS, browser);

    expect(FakeAudioContext.created).toHaveLength(1);
    expect(FakeAudioContext.created[0]?.oscillators).toHaveLength(2);
    const [notification] = FakeNotification.shown;
    expect(notification?.title).toBe('Sam te está llamando');
    expect(notification?.options).toMatchObject({ body: TEXTS.body, silent: false });

    notification?.onclick?.();

    expect(browser.focusWindow).toHaveBeenCalledOnce();
    expect(notification?.close).toHaveBeenCalledOnce();
  });

  it('busy people get the notification without sound', () => {
    const browser = env('granted');

    showRingAlert({ fromUserId: 'sam', fromDisplayName: 'Sam', silent: true }, TEXTS, browser);

    expect(FakeAudioContext.created).toHaveLength(0);
    expect(FakeNotification.shown[0]?.options.silent).toBe(true);
  });

  it('only rings when the permission was not granted', () => {
    const browser = env('denied');

    showRingAlert({ fromUserId: 'sam', fromDisplayName: 'Sam', silent: false }, TEXTS, browser);

    expect(FakeAudioContext.created).toHaveLength(1);
    expect(FakeNotification.shown).toHaveLength(0);
  });
});

describe('requestNotificationPermissionOnce', () => {
  it('asks only while the person has not decided', () => {
    requestNotificationPermissionOnce(env('default'));
    expect(FakeNotification.requestPermission).toHaveBeenCalledOnce();

    requestNotificationPermissionOnce(env('granted'));
    requestNotificationPermissionOnce(env('denied'));
    expect(FakeNotification.requestPermission).not.toHaveBeenCalled();
  });

  it('can ask only while the browser supports it and the person has not decided', () => {
    expect(canAskNotificationPermission(env('default'))).toBe(true);
    expect(canAskNotificationPermission(env('granted'))).toBe(false);
    expect(canAskNotificationPermission(env('denied'))).toBe(false);
    expect(canAskNotificationPermission({ focusWindow: () => undefined })).toBe(false);
  });
});
