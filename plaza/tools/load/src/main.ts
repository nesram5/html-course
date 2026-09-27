import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import process from 'node:process';
import { setTimeout as sleep } from 'node:timers/promises';
import { parseArgs } from 'node:util';

import {
  PROTOCOL_VERSION,
  REALTIME_PATH,
  type ClientToServerEvents,
  type Direction,
  type ServerToClientEvents,
  type WorldMap,
} from '@plaza/shared';
import { io, type Socket } from 'socket.io-client';

import { createSpace, fetchWorldMap, health, joinSpace, signIn, type BotSession } from './api.js';
import { LatencyTracker, summarize } from './stats.js';
import { nextStep } from './walker.js';

type Client = Socket<ServerToClientEvents, ClientToServerEvents>;

const USAGE = `Usage: pnpm --filter @plaza/load load [options]

  --url <url>             API origin (default http://localhost:3000)
  --bots <n>              bots in one space (default 50)
  --duration <s>          walking time in seconds (default 60)
  --steps-per-second <n>  steps per bot and second (default 4, the server allows 10)
  --template <id>         map template of the new space (default office-small@1)

The server needs AUTH_TEST_LOGIN=true and enough RATE_LIMIT_PER_MINUTE for 2 requests per bot.
`;

const { values } = parseArgs({
  options: {
    url: { type: 'string', default: 'http://localhost:3000' },
    bots: { type: 'string', default: '50' },
    duration: { type: 'string', default: '60' },
    'steps-per-second': { type: 'string', default: '4' },
    template: { type: 'string', default: 'office-small@1' },
    help: { type: 'boolean', default: false },
  },
});

function print(line = ''): void {
  process.stdout.write(`${line}\n`);
}

function positiveNumber(name: string, raw: string): number {
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) throw new Error(`--${name} must be a positive number`);
  return value;
}

interface Counters {
  movesSent: number;
  corrections: number;
  deltas: number;
  errors: number;
  unexpectedDisconnects: number;
}

/** One simulated person: joins the space and walks randomly, respecting collisions. */
class Bot {
  #x = 0;
  #y = 0;
  #dir: Direction | null = null;
  #timer: NodeJS.Timeout | undefined;
  #stopping = false;

  constructor(
    readonly session: BotSession,
    private readonly client: Client,
    private readonly map: WorldMap,
    private readonly tracker: LatencyTracker,
    private readonly counters: Counters,
  ) {
    client.on('world:delta', (delta) => {
      counters.deltas++;
      const now = performance.now();
      for (const moved of delta.moved) tracker.received(moved.userId, moved.x, moved.y, now);
    });
    client.on('player:correct', ({ x, y }) => {
      counters.corrections++;
      this.#x = x;
      this.#y = y;
    });
    client.on('error', () => {
      counters.errors++;
    });
    client.on('disconnect', () => {
      if (!this.#stopping) counters.unexpectedDisconnects++;
    });
  }

  async join(spaceId: string): Promise<void> {
    const ack = await this.client.emitWithAck('space:join', { v: PROTOCOL_VERSION, spaceId });
    if (!ack.ok) throw new Error(`space:join failed: ${ack.error.code}`);
    this.#x = ack.data.self.x;
    this.#y = ack.data.self.y;
  }

  walk(stepMs: number): void {
    const step = (): void => {
      const next = nextStep(this.map, { x: this.#x, y: this.#y }, this.#dir);
      if (next !== null) {
        this.#x = next.x;
        this.#y = next.y;
        this.#dir = next.dir;
        this.tracker.sent(this.session.userId, next.x, next.y, performance.now());
        this.client.emit('player:move', { v: PROTOCOL_VERSION, ...next });
        this.counters.movesSent++;
      }
      // ±20 % jitter so the bots do not step in lockstep.
      this.#timer = setTimeout(step, stepMs * (0.8 + Math.random() * 0.4));
    };
    this.#timer = setTimeout(step, Math.random() * stepMs);
  }

  stop(): void {
    this.#stopping = true;
    clearTimeout(this.#timer);
    this.client.close();
  }
}

function connect(url: string, cookie: string): Promise<Client> {
  const client: Client = io(url, {
    path: REALTIME_PATH,
    transports: ['websocket'],
    reconnection: false,
    extraHeaders: { cookie },
  });
  return new Promise((resolve, reject) => {
    client.once('connect', () => {
      resolve(client);
    });
    client.once('connect_error', reject);
  });
}

async function main(): Promise<void> {
  if (values.help) {
    print(USAGE);
    return;
  }
  const url = values.url;
  const botCount = positiveNumber('bots', values.bots);
  const durationS = positiveNumber('duration', values.duration);
  const stepsPerSecond = positiveNumber('steps-per-second', values['steps-per-second']);
  const run = randomUUID().slice(0, 8);

  print(
    `Plaza load test ${run}: ${String(botCount)} bots, ${String(durationS)} s, ${String(stepsPerSecond)} steps/s each → ${url}`,
  );
  const sessions: BotSession[] = [];
  for (let i = 0; i < botCount; i++) {
    const name = `Bot ${String(i + 1).padStart(2, '0')}`;
    sessions.push(await signIn(url, `bot-${run}-${String(i + 1)}@load.plaza.test`, name));
  }
  const [owner] = sessions;
  if (owner === undefined) throw new Error('No bots');
  const space = await createSpace(url, owner, `Carga ${run}`, values.template);
  for (const bot of sessions.slice(1)) await joinSpace(url, bot, space.inviteToken);
  const map = await fetchWorldMap(url, space.mapTemplateId);

  const tracker = new LatencyTracker();
  const counters: Counters = {
    movesSent: 0,
    corrections: 0,
    deltas: 0,
    errors: 0,
    unexpectedDisconnects: 0,
  };
  const bots: Bot[] = [];
  for (const session of sessions) {
    const bot = new Bot(session, await connect(url, session.cookie), map, tracker, counters);
    await bot.join(space.spaceId);
    bots.push(bot);
  }
  print(`${String(bots.length)} bots in space ${space.spaceId}; walking…`);

  const started = performance.now();
  for (const bot of bots) bot.walk(1000 / stepsPerSecond);
  await sleep(durationS * 1000);
  const serverHealth = await health(url);
  for (const bot of bots) bot.stop();
  const elapsedS = (performance.now() - started) / 1000;

  const latency = summarize(tracker.samples);
  const round = (value: number | null) => (value === null ? 'n/a' : `${value.toFixed(1)} ms`);
  print();
  print(
    `moves sent:            ${String(counters.movesSent)} (${(counters.movesSent / elapsedS).toFixed(0)}/s)`,
  );
  print(`rejected moves:        ${String(counters.corrections)} (player:correct)`);
  print(
    `world:delta received:  ${String(counters.deltas)} (${(counters.deltas / elapsedS / botCount).toFixed(1)}/s per bot)`,
  );
  print(`latency samples:       ${String(latency.samples)}`);
  print(
    `move → delta latency:  p50 ${round(latency.p50)} · p95 ${round(latency.p95)} · p99 ${round(latency.p99)} · max ${round(latency.max)}`,
  );
  print(
    `socket errors:         ${String(counters.errors)}; unexpected disconnects: ${String(counters.unexpectedDisconnects)}`,
  );
  print(`server /api/health:    ${JSON.stringify(serverHealth)}`);
  print(
    JSON.stringify({
      run,
      bots: botCount,
      durationS: Number(elapsedS.toFixed(1)),
      stepsPerSecond,
      ...counters,
      latencyMs: latency,
      health: serverHealth,
    }),
  );
}

main().catch((error: unknown) => {
  process.stderr.write(
    `${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`,
  );
  process.exitCode = 1;
});
