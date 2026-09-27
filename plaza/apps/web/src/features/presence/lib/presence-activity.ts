import { AWAY_IDLE_MS } from '@plaza/shared';

/** Interactions that prove the person is at the computer (RN-05: "cualquier interacción"). */
export const ACTIVITY_EVENTS = [
  'pointerdown',
  'pointermove',
  'keydown',
  'wheel',
  'touchstart',
  'focus',
] as const;

export interface PresenceActivityOptions {
  readonly document: Document;
  readonly window: Window;
  /** Called every time the computed away flag changes. */
  readonly onChange: (away: boolean) => void;
  /** Inactivity before becoming away (default `AWAY_IDLE_MS`, 10 min). */
  readonly idleMs?: number;
  readonly now?: () => number;
}

/**
 * Automatic away detection (E7-S1, RN-05), framework-free:
 * - the tab is hidden (`visibilitychange`) → away at once; visible again → back;
 * - no interaction for 10 min → away; any interaction → back.
 *
 * Interactions only record a timestamp (pointer moves are frequent); a single timer checks it
 * when the idle period could have ended.
 */
export class PresenceActivity {
  private hidden = false;
  private idle = false;
  private lastActivity = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private readonly idleMs: number;
  private readonly now: () => number;

  constructor(private readonly options: PresenceActivityOptions) {
    this.idleMs = options.idleMs ?? AWAY_IDLE_MS;
    this.now = options.now ?? Date.now;
  }

  /** Away right now: hidden tab or idle. */
  get away(): boolean {
    return this.hidden || this.idle;
  }

  start(): void {
    this.hidden = this.options.document.visibilityState === 'hidden';
    this.idle = false;
    this.lastActivity = this.now();
    this.options.document.addEventListener('visibilitychange', this.onVisibilityChange);
    for (const event of ACTIVITY_EVENTS) {
      this.options.window.addEventListener(event, this.onActivity, { passive: true });
    }
    this.schedule(this.idleMs);
    if (this.hidden) this.options.onChange(true);
  }

  stop(): void {
    this.options.document.removeEventListener('visibilitychange', this.onVisibilityChange);
    for (const event of ACTIVITY_EVENTS) {
      this.options.window.removeEventListener(event, this.onActivity);
    }
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
  }

  private readonly onVisibilityChange = (): void => {
    const hidden = this.options.document.visibilityState === 'hidden';
    if (hidden === this.hidden) return;
    const before = this.away;
    this.hidden = hidden;
    // Coming back to the tab is an interaction.
    if (!hidden) this.markActive();
    this.notify(before);
  };

  private readonly onActivity = (): void => {
    const before = this.away;
    this.markActive();
    this.notify(before);
  };

  private markActive(): void {
    this.lastActivity = this.now();
    if (this.idle) {
      this.idle = false;
      this.schedule(this.idleMs);
    }
  }

  private schedule(delayMs: number): void {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = setTimeout(this.check, delayMs);
  }

  private readonly check = (): void => {
    this.timer = null;
    const elapsed = this.now() - this.lastActivity;
    if (elapsed < this.idleMs) {
      this.schedule(this.idleMs - elapsed);
      return;
    }
    const before = this.away;
    this.idle = true;
    this.notify(before);
  };

  private notify(before: boolean): void {
    if (this.away !== before) this.options.onChange(this.away);
  }
}
