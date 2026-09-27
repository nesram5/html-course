import { performance } from 'node:perf_hooks';

/** Stops a timer created by {@link Timers}. Calling it twice is harmless. */
export type CancelTimer = () => void;

/**
 * Timer seam of the realtime runtime (ticks, reconnection grace, runtime unload), so tests drive
 * time by hand (`ManualTimers` in `src/test/manual-timers.ts`) instead of sleeping.
 */
export interface Timers {
  /** Monotonic clock in milliseconds (rate limits). */
  now(): number;
  /** Runs `fn` once after `ms` milliseconds. */
  after(ms: number, fn: () => void): CancelTimer;
  /** Runs `fn` every `ms` milliseconds. */
  every(ms: number, fn: () => void): CancelTimer;
}

/**
 * Node timers. They are `unref`'d: a pending grace period or tick never keeps the process
 * alive on shutdown (the world module also cancels them when the app closes).
 */
export const systemTimers: Timers = {
  now: () => performance.now(),
  after(ms, fn) {
    const handle = setTimeout(fn, ms);
    handle.unref();
    return () => {
      clearTimeout(handle);
    };
  },
  every(ms, fn) {
    const handle = setInterval(fn, ms);
    handle.unref();
    return () => {
      clearInterval(handle);
    };
  },
};
