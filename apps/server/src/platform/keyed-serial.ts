/**
 * Runs async tasks one at a time per key (e.g. per space), in the order they were queued.
 * Tasks with different keys run concurrently. Used where a database write and the broadcast
 * that announces it must not interleave with another write to the same thing: otherwise two
 * concurrent requests can reach the clients in the opposite order to the one they reached the
 * database, and the clients end up showing something that is not stored.
 *
 * In-process only: enough for the single server instance of the MVP (the live state of the
 * spaces is in memory too, architecture §5.3).
 */
export class KeyedSerial {
  readonly #tails = new Map<string, Promise<unknown>>();

  /** Keys with queued or running tasks. */
  get size(): number {
    return this.#tails.size;
  }

  /** Runs `task` after every task queued before under `key`; resolves or rejects like it. */
  run<T>(key: string, task: () => Promise<T>): Promise<T> {
    // Tails never reject, so a failed task does not stop the ones queued after it.
    const previous = this.#tails.get(key) ?? Promise.resolve();
    const result = previous.then(task);
    const tail = result.then(
      () => undefined,
      () => undefined,
    );
    this.#tails.set(key, tail);
    void tail.then(() => {
      if (this.#tails.get(key) === tail) this.#tails.delete(key);
    });
    return result;
  }
}
