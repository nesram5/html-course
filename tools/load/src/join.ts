import type { ErrorCode } from '@plaza/shared';

/** A bot whose `space:join` was refused (`SPACE_FULL`, `RATE_LIMITED`, `NOT_A_MEMBER`...). */
export class JoinError extends Error {
  constructor(
    readonly bot: number,
    readonly code: ErrorCode,
  ) {
    super(
      code === 'SPACE_FULL'
        ? `Bot ${String(bot)} could not join: SPACE_FULL (the space is full; lower --bots or raise MAX_PLAYERS_PER_SPACE)`
        : `Bot ${String(bot)} could not join: ${code}`,
    );
    this.name = 'JoinError';
  }
}

/** What `joinBots` needs from a bot. */
export interface JoiningBot {
  join(spaceId: string): Promise<void>;
  /** Closes the socket and stops the timers of the bot. */
  stop(): void;
}

/**
 * Opens and joins one bot per session, in order. When a bot cannot connect or join, every bot
 * opened so far is stopped before the error is rethrown, so the process exits (non-zero) instead
 * of hanging on open sockets.
 */
export async function joinBots<S, B extends JoiningBot>(
  sessions: readonly S[],
  open: (session: S, index: number) => Promise<B>,
  spaceId: string,
): Promise<B[]> {
  const bots: B[] = [];
  try {
    for (const [index, session] of sessions.entries()) {
      const bot = await open(session, index);
      bots.push(bot);
      await bot.join(spaceId);
    }
    return bots;
  } catch (error) {
    for (const bot of bots) bot.stop();
    throw error;
  }
}
