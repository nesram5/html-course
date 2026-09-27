import { afterEach, describe, expect, it, vi } from 'vitest';

import { ManualTimers } from '../../test/manual-timers.js';
import { systemTimers } from '../timers.js';

describe('systemTimers', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('runs one-shot and repeated timers until cancelled', () => {
    vi.useFakeTimers();
    const calls: string[] = [];
    const cancelOnce = systemTimers.after(100, () => calls.push('once'));
    const cancelled = systemTimers.after(100, () => calls.push('cancelled'));
    const stop = systemTimers.every(40, () => calls.push('tick'));
    cancelled();

    vi.advanceTimersByTime(100);
    stop();
    vi.advanceTimersByTime(1000);
    cancelOnce();

    expect(calls).toEqual(['tick', 'tick', 'once']);
    expect(systemTimers.now()).toEqual(expect.any(Number));
  });
});

describe('ManualTimers', () => {
  it('fires due timers in time order and only when advanced', () => {
    const timers = new ManualTimers();
    const calls: string[] = [];
    timers.every(30, () => calls.push(`tick@${String(timers.now())}`));
    timers.after(50, () => calls.push(`once@${String(timers.now())}`));
    const cancel = timers.after(10, () => calls.push('cancelled'));
    cancel();

    timers.advance(29);
    const early = [...calls];
    timers.advance(61);

    expect(early).toEqual([]);
    expect(calls).toEqual(['tick@30', 'once@50', 'tick@60', 'tick@90']);
    expect(timers.now()).toBe(90);
    expect(timers.pending).toBe(1);
  });
});
