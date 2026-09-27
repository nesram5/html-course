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
} from '@bululu/shared';
import { io, type Socket } from 'socket.io-client';

import { createSpace, fetchWorldMap, health, joinSpace, signIn, type BotSession } from './api.js';
import { JoinError, joinBots } from './join.js';
import { LatencyTracker, memoryTrend, percentile, summarize, type ServerSample } from './stats.js';
import { nextStep } from './walker.js';

type Client = Socket<ServerToClientEvents, ClientToServerEvents>;

const USAGE = `Usage: pnpm --filter @bululu/load load [options]

  --url <url>             API origin (default http://localhost:3000)
  --bots <n>              bots in one space (default 50)
  --duration <s>          walking time in seconds (default 60)
  --steps-per-second <n>  steps per bot and second (default 4, the server allows 10)
  --template <id>         map template of the new space (default office-small@1)
  --sample-every <s>      read /api/health every s seconds (default 30): memory, tick, latency
  --health-token <token>  X-Health-Token for the figures (default $BULULU_HEALTH_TOKEN)

The server needs AUTH_TEST_LOGIN=true and enough RATE_LIMIT_PER_MINUTE for 2 requests per bot.
`;

const { values } = parseArgs({
  options: {
    url: { type: 'string', default: 'http://localhost:3000' },
    bots: { type: 'string', default: '50' },
    duration: { type: 'string', default: '60' },
    'steps-per-second': { type: 'string', default: '4' },
    template: { type: 'string', default: 'office-small@1' },
    'sample-every': { type: 'string', default: '30' },
    'health-token': { type: 'string', default: process.env.BULULU_HEALTH_TOKEN ?? '' },
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
    readonly index: number,
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
    if (!ack.ok) throw new JoinError(this.index + 1, ack.error.code);
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
  const sampleEveryS = positiveNumber('sample-every', values['sample-every']);
  const healthToken = values['health-token'];
  const run = randomUUID().slice(0, 8);

  print(
    `Bululu load test ${run}: ${String(botCount)} bots, ${String(durationS)} s, ${String(stepsPerSecond)} steps/s each → ${url}`,
  );
  const sessions: BotSession[] = [];
  for (let i = 0; i < botCount; i++) {
    const name = `Bot ${String(i + 1).padStart(2, '0')}`;
    sessions.push(await signIn(url, `bot-${run}-${String(i + 1)}@load.bululu.test`, name));
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
  // A refused join (SPACE_FULL...) stops every bot and ends the run with exit code 1.
  const bots = await joinBots(
    sessions,
    async (session, index) =>
      new Bot(index, session, await connect(url, session.cookie), map, tracker, counters),
    space.spaceId,
  );
  print(`${String(bots.length)} bots in space ${space.spaceId}; walking…`);

  const started = performance.now();
  const samples: ServerSample[] = [];
  let seenSamples = 0;
  const sampleServer = async (): Promise<unknown> => {
    const reading = await health(url, healthToken);
    const window = tracker.samples.slice(seenSamples);
    seenSamples = tracker.samples.length;
    const connected = reading.realtime?.connectedBySpace[space.spaceId];
    const sample: ServerSample = {
      atS: Math.round((performance.now() - started) / 1000),
      rssMb: reading.process?.rssMb ?? null,
      heapUsedMb: reading.process?.heapUsedMb ?? null,
      avgTickMs: reading.realtime?.avgTickMs ?? null,
      connected: connected ?? null,
      latencyP95Ms: percentile(window, 95),
    };
    samples.push(sample);
    print(`  t=${String(sample.atS)}s ${JSON.stringify(sample)}`);
    return reading;
  };
  let serverHealth: unknown;
  try {
    for (const bot of bots) bot.walk(1000 / stepsPerSecond);
    const endAt = started + durationS * 1000;
    while (performance.now() + sampleEveryS * 1000 < endAt) {
      await sleep(sampleEveryS * 1000);
      await sampleServer();
    }
    await sleep(Math.max(0, endAt - performance.now()));
    serverHealth = await sampleServer();
  } finally {
    for (const bot of bots) bot.stop();
  }
  const elapsedS = (performance.now() - started) / 1000;
  const trend = memoryTrend(samples, Math.min(60, durationS / 4));

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
    trend === null
      ? 'server heap trend:     n/a (no process figures: pass --health-token)'
      : `server heap trend:     ${trend.fromMb.toFixed(1)} → ${trend.toMb.toFixed(1)} MB (${trend.mbPerMinute.toFixed(2)} MB/min after warm-up)`,
  );
  print(
    JSON.stringify({
      run,
      bots: botCount,
      durationS: Number(elapsedS.toFixed(1)),
      stepsPerSecond,
      ...counters,
      latencyMs: latency,
      heapTrend: trend,
      samples,
      health: serverHealth,
    }),
  );
}

main().catch((error: unknown) => {
  // Every socket is closed by now, so setting the exit code is enough: the process ends.
  const message =
    error instanceof JoinError
      ? error.message
      : error instanceof Error
        ? (error.stack ?? error.message)
        : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
