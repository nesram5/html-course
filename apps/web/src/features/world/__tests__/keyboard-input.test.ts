import type { Direction } from '@plaza/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  KeyboardInput,
  directionOfKey,
  isTypingTarget,
  type KeyboardHandlers,
} from '../game/controller/keyboard-input';

function handlers() {
  return {
    press: vi.fn<(dir: Direction) => void>(),
    release: vi.fn<(dir: Direction) => void>(),
    releaseAll: vi.fn<() => void>(),
    zoomIn: vi.fn<() => void>(),
    zoomOut: vi.fn<() => void>(),
  } satisfies KeyboardHandlers;
}

function key(
  type: 'keydown' | 'keyup',
  init: KeyboardEventInit,
  target: EventTarget = window,
): KeyboardEvent {
  const event = new KeyboardEvent(type, { bubbles: true, cancelable: true, ...init });
  target.dispatchEvent(event);
  return event;
}

describe('directionOfKey', () => {
  it('maps arrows and WASD (by physical key) to directions', () => {
    expect(directionOfKey({ key: 'ArrowUp', code: 'ArrowUp' })).toBe('up');
    expect(directionOfKey({ key: 'ArrowLeft', code: 'ArrowLeft' })).toBe('left');
    expect(directionOfKey({ key: 'z', code: 'KeyW' })).toBe('up'); // AZERTY "z" is the W key
    expect(directionOfKey({ key: 'd', code: 'KeyD' })).toBe('right');
    expect(directionOfKey({ key: 'Tab', code: 'Tab' })).toBeNull();
  });
});

describe('isTypingTarget', () => {
  it('detects text fields, textareas, selects and contenteditable', () => {
    const text = document.createElement('input');
    const checkbox = Object.assign(document.createElement('input'), { type: 'checkbox' });
    const editable = document.createElement('div');
    editable.setAttribute('contenteditable', 'true');
    const child = document.createElement('span');
    editable.append(child);
    document.body.append(editable);

    expect(isTypingTarget(text)).toBe(true);
    expect(isTypingTarget(document.createElement('textarea'))).toBe(true);
    expect(isTypingTarget(document.createElement('select'))).toBe(true);
    expect(isTypingTarget(child)).toBe(true);
    expect(isTypingTarget(checkbox)).toBe(false);
    expect(isTypingTarget(document.createElement('button'))).toBe(false);
    expect(isTypingTarget(null)).toBe(false);
    editable.remove();
  });
});

describe('KeyboardInput', () => {
  let h: ReturnType<typeof handlers>;
  let input: KeyboardInput;

  beforeEach(() => {
    h = handlers();
    input = new KeyboardInput(window, h);
    input.attach();
  });

  afterEach(() => {
    input.detach();
    document.body.innerHTML = '';
  });

  it('presses and releases directions, preventing page scroll', () => {
    const down = key('keydown', { key: 'ArrowRight', code: 'ArrowRight' });
    key('keyup', { key: 'ArrowRight', code: 'ArrowRight' });

    expect(h.press).toHaveBeenCalledWith('right');
    expect(h.release).toHaveBeenCalledWith('right');
    expect(down.defaultPrevented).toBe(true);
  });

  it('ignores auto-repeat and keys with modifiers', () => {
    key('keydown', { key: 'ArrowUp', code: 'ArrowUp', repeat: true });
    key('keydown', { key: 'a', code: 'KeyA', ctrlKey: true });

    expect(h.press).not.toHaveBeenCalled();
  });

  it('ignores keys typed in a text field', () => {
    const field = document.createElement('input');
    document.body.append(field);

    const event = key('keydown', { key: 'w', code: 'KeyW' }, field);
    key('keydown', { key: '+', code: 'Equal' }, field);

    expect(h.press).not.toHaveBeenCalled();
    expect(h.zoomIn).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
  });

  it('releases every key when focus moves into a text field or the window blurs', () => {
    const field = document.createElement('textarea');
    document.body.append(field);

    field.focus();
    expect(h.releaseAll).toHaveBeenCalledTimes(1);

    window.dispatchEvent(new Event('blur'));
    expect(h.releaseAll).toHaveBeenCalledTimes(2);
  });

  it('zooms with + and -', () => {
    key('keydown', { key: '+', code: 'Equal' });
    key('keydown', { key: '-', code: 'Minus' });
    key('keydown', { key: 'Add', code: 'NumpadAdd' });

    expect(h.zoomIn).toHaveBeenCalledTimes(2);
    expect(h.zoomOut).toHaveBeenCalledTimes(1);
  });

  it('never captures Tab', () => {
    const event = key('keydown', { key: 'Tab', code: 'Tab' });

    expect(event.defaultPrevented).toBe(false);
  });

  it('stops listening after detach', () => {
    input.detach();
    h.press.mockClear();

    key('keydown', { key: 'ArrowDown', code: 'ArrowDown' });

    expect(h.press).not.toHaveBeenCalled();
    expect(h.releaseAll).toHaveBeenCalled();
  });
});
