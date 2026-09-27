import type { RingReceived } from '@plaza/shared';

/** Browser APIs used by the ring alert, injectable for tests. */
export interface RingAlertEnv {
  readonly Notification?: typeof Notification;
  readonly AudioContext?: typeof AudioContext;
  focusWindow(): void;
}

function browserEnv(): RingAlertEnv {
  return {
    ...(typeof Notification !== 'undefined' && { Notification }),
    ...(typeof AudioContext !== 'undefined' && { AudioContext }),
    focusWindow: () => {
      window.focus();
    },
  };
}

/**
 * `true` when the browser supports notifications and the person has not answered the
 * permission question yet: whoever is rung only gets a notification once they said yes.
 */
export function canAskNotificationPermission(env: RingAlertEnv = browserEnv()): boolean {
  return env.Notification?.permission === 'default';
}

/**
 * Asks for the notification permission, always from a click (E7-S5: never on entering): the
 * first "Llamar", "Activar avisos de llamadas" in the status menu, or the button of the first
 * ring received. Does nothing when it was already granted or denied, or when unsupported.
 */
export function requestNotificationPermissionOnce(env: RingAlertEnv = browserEnv()): void {
  const api = env.Notification;
  if (api?.permission !== 'default') return;
  void api.requestPermission().catch(() => undefined);
}

/** Two short tones (the "ring"). Silent when audio is unavailable or blocked. */
export function playRingSound(env: RingAlertEnv = browserEnv()): void {
  const Context = env.AudioContext;
  if (Context === undefined) return;
  try {
    const context = new Context();
    const gain = context.createGain();
    gain.connect(context.destination);
    const start = context.currentTime;
    for (const [index, frequency] of [880, 660].entries()) {
      const oscillator = context.createOscillator();
      const at = start + index * 0.25;
      oscillator.frequency.value = frequency;
      oscillator.connect(gain);
      gain.gain.setValueAtTime(0.2, at);
      gain.gain.exponentialRampToValueAtTime(0.001, at + 0.22);
      oscillator.start(at);
      oscillator.stop(at + 0.22);
    }
    setTimeout(() => {
      void context.close().catch(() => undefined);
    }, 1000);
  } catch {
    // Autoplay policies can refuse audio before the first interaction: the notification remains.
  }
}

export interface RingAlertTexts {
  /** "Sam te está llamando". */
  readonly title: string;
  /** Second line of the notification. */
  readonly body: string;
}

/**
 * Someone rang (E7-S5): a sound (unless the person is busy: `silent`) and a browser notification
 * when the permission was granted. Clicking the notification brings the Plaza tab back, which
 * ends the "away" state and restores the media.
 */
export function showRingAlert(
  ring: RingReceived,
  texts: RingAlertTexts,
  env: RingAlertEnv = browserEnv(),
): void {
  if (!ring.silent) playRingSound(env);
  const api = env.Notification;
  if (api?.permission !== 'granted') return;
  try {
    const notification = new api(texts.title, {
      body: texts.body,
      silent: ring.silent,
      tag: `plaza-ring-${ring.fromUserId}`,
    });
    notification.onclick = () => {
      env.focusWindow();
      notification.close();
    };
  } catch {
    // Some browsers (Android Chrome) only allow notifications from a service worker.
  }
}
