import { describe, expect, it } from 'vitest';

import { JoinError, joinBots, type JoiningBot } from '../join.js';

class FakeBot implements JoiningBot {
  joined: string | null = null;
  stopped = false;

  constructor(private readonly refuseWith: JoinError | null) {}

  join(spaceId: string): Promise<void> {
    if (this.refuseWith !== null) return Promise.reject(this.refuseWith);
    this.joined = spaceId;
    return Promise.resolve();
  }

  stop(): void {
    this.stopped = true;
  }
}

describe('joinBots', () => {
  it('opens and joins every bot in order', async () => {
    const opened: number[] = [];

    const bots = await joinBots(
      ['a', 'b', 'c'],
      (_session, index) => {
        opened.push(index);
        return Promise.resolve(new FakeBot(null));
      },
      'space-1',
    );

    expect(opened).toEqual([0, 1, 2]);
    expect(bots.map((bot) => [bot.joined, bot.stopped])).toEqual([
      ['space-1', false],
      ['space-1', false],
      ['space-1', false],
    ]);
  });

  it('stops every bot opened so far when one gets SPACE_FULL, and rethrows', async () => {
    const created: FakeBot[] = [];

    const run = joinBots(
      [1, 2, 3, 4],
      (_session, index) => {
        const bot = new FakeBot(index === 2 ? new JoinError(index + 1, 'SPACE_FULL') : null);
        created.push(bot);
        return Promise.resolve(bot);
      },
      'space-1',
    );

    await expect(run).rejects.toThrow(/^Bot 3 could not join: SPACE_FULL/);
    expect(created).toHaveLength(3); // the fourth bot is never opened
    expect(created.every((bot) => bot.stopped)).toBe(true);
  });

  it('stops the bots already opened when a connection fails', async () => {
    const created: FakeBot[] = [];

    const run = joinBots(
      [1, 2],
      (_session, index) => {
        if (index === 1) return Promise.reject(new Error('connect_error'));
        const bot = new FakeBot(null);
        created.push(bot);
        return Promise.resolve(bot);
      },
      'space-1',
    );

    await expect(run).rejects.toThrow('connect_error');
    expect(created.map((bot) => bot.stopped)).toEqual([true]);
  });

  it('names other join errors by their code', () => {
    expect(new JoinError(7, 'RATE_LIMITED').message).toBe('Bot 7 could not join: RATE_LIMITED');
  });
});
