import { describe, expect, it } from 'vitest';

import { KeyedSerial } from '../keyed-serial.js';

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

describe('KeyedSerial', () => {
  it('runs the tasks of one key one at a time, in order, and other keys concurrently', async () => {
    const serial = new KeyedSerial();
    const log: string[] = [];
    const gate = deferred();

    const first = serial.run('a', async () => {
      log.push('a1 start');
      await gate.promise;
      log.push('a1 end');
      return 1;
    });
    const second = serial.run('a', () => {
      log.push('a2');
      return Promise.resolve(2);
    });
    const other = serial.run('b', () => {
      log.push('b1');
      return Promise.resolve(3);
    });

    expect(await other).toBe(3);
    expect(log).toEqual(['a1 start', 'b1']);
    gate.resolve();
    expect(await Promise.all([first, second])).toEqual([1, 2]);
    expect(log).toEqual(['a1 start', 'b1', 'a1 end', 'a2']);
  });

  it('keeps going after a task fails and forgets idle keys', async () => {
    const serial = new KeyedSerial();
    const failed = serial.run('a', () => Promise.reject(new Error('boom')));
    const next = serial.run('a', () => Promise.resolve('ok'));

    await expect(failed).rejects.toThrow('boom');
    expect(await next).toBe('ok');
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(serial.size).toBe(0);
  });
});
