import type { Direction } from '@bululu/shared';

/** Arrow keys (by `key`) and WASD (by physical `code`, so it works on any keyboard layout). */
const DIRECTION_BY_KEY: Readonly<Record<string, Direction>> = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
};
const DIRECTION_BY_CODE: Readonly<Record<string, Direction>> = {
  KeyW: 'up',
  KeyS: 'down',
  KeyA: 'left',
  KeyD: 'right',
};
const ZOOM_IN_KEYS = new Set(['+', '=']);
const ZOOM_OUT_KEYS = new Set(['-', '_']);

export function directionOfKey(event: Pick<KeyboardEvent, 'key' | 'code'>): Direction | null {
  return DIRECTION_BY_KEY[event.key] ?? DIRECTION_BY_CODE[event.code] ?? null;
}

const TEXT_INPUT_TYPES = new Set([
  'text',
  'search',
  'email',
  'url',
  'tel',
  'password',
  'number',
  'date',
  'datetime-local',
  'month',
  'time',
  'week',
]);

/** `true` when keys typed on `target` are text (inputs, textareas, selects, contenteditable). */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable || target.closest('[contenteditable="true"]') !== null) return true;
  if (target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) return true;
  return target instanceof HTMLInputElement && TEXT_INPUT_TYPES.has(target.type);
}

export interface KeyboardHandlers {
  press(dir: Direction): void;
  release(dir: Direction): void;
  releaseAll(): void;
  zoomIn(): void;
  zoomOut(): void;
}

/**
 * Keyboard of the world, listening on `window` (not through Phaser, which would swallow keys
 * typed in the chat): arrows/WASD walk, `+`/`-` zoom. Keys typed in text fields are ignored,
 * and `Tab` is never captured so focus can leave the canvas (E3-S6).
 */
export class KeyboardInput {
  constructor(
    private readonly target: Window,
    private readonly handlers: KeyboardHandlers,
  ) {}

  attach(): void {
    this.target.addEventListener('keydown', this.onKeyDown);
    this.target.addEventListener('keyup', this.onKeyUp);
    this.target.addEventListener('blur', this.onBlur);
    this.target.addEventListener('focusin', this.onFocusIn);
  }

  detach(): void {
    this.target.removeEventListener('keydown', this.onKeyDown);
    this.target.removeEventListener('keyup', this.onKeyUp);
    this.target.removeEventListener('blur', this.onBlur);
    this.target.removeEventListener('focusin', this.onFocusIn);
    this.handlers.releaseAll();
  }

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) return;
    if (isTypingTarget(event.target)) return;
    const dir = directionOfKey(event);
    if (dir !== null) {
      event.preventDefault(); // no page scroll with the arrows
      if (!event.repeat) this.handlers.press(dir);
      return;
    }
    if (ZOOM_IN_KEYS.has(event.key) || event.code === 'NumpadAdd') this.handlers.zoomIn();
    else if (ZOOM_OUT_KEYS.has(event.key) || event.code === 'NumpadSubtract')
      this.handlers.zoomOut();
  };

  private readonly onKeyUp = (event: KeyboardEvent): void => {
    const dir = directionOfKey(event);
    if (dir !== null) this.handlers.release(dir);
  };

  private readonly onBlur = (): void => {
    this.handlers.releaseAll();
  };

  private readonly onFocusIn = (event: FocusEvent): void => {
    if (isTypingTarget(event.target)) this.handlers.releaseAll();
  };
}
