import type { CancelTimer, Timers } from '../platform/timers.js';

interface Task {
  id: number;
  at: number;
  fn: () => void;
  /** Period of an `every` timer. */
  period: number | null;
}

/**
 * Fake {@link Timers} driven by hand: nothing runs until `advance(ms)`, which fires every due
 * timer in time order (intervals as many times as they fit). Standards §7: no sleeps in tests.
 */
export class ManualTimers implements Timers {
  #now = 0;
  #nextId = 1;
  readonly #tasks = new Map<number, Task>();

  /** Milliseconds advanced so far. */
  now(): number {
    return this.#now;
  }

  /** Number of pending timers (one-shot and intervals). */
  get pending(): number {
    return this.#tasks.size;
  }

  after(ms: number, fn: () => void): CancelTimer {
    return this.#add(ms, fn, null);
  }

  every(ms: number, fn: () => void): CancelTimer {
    return this.#add(ms, fn, Math.max(1, ms));
  }

  /** Moves the clock forward, running every timer that becomes due, in order. */
  advance(ms: number): void {
    const target = this.#now + ms;
    for (;;) {
      const next = [...this.#tasks.values()]
        .filter((task) => task.at <= target)
        .sort((a, b) => a.at - b.at || a.id - b.id)[0];
      if (next === undefined) break;
      this.#now = next.at;
      if (next.period === null) this.#tasks.delete(next.id);
      else next.at += next.period;
      next.fn();
    }
    this.#now = target;
  }

  #add(ms: number, fn: () => void, period: number | null): CancelTimer {
    const id = this.#nextId++;
    this.#tasks.set(id, { id, at: this.#now + Math.max(0, ms), fn, period });
    return () => {
      this.#tasks.delete(id);
    };
  }
}
