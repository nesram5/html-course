import type { AddressInfo } from 'node:net';

import {
  API_PATHS,
  apiPath,
  PROTOCOL_VERSION,
  REALTIME_PATH,
  SpaceResponseSchema,
  TICK_MS,
  type Ack,
  type ClientToServerEvents,
  type ServerEventName,
  type ServerEventPayload,
  type ServerToClientEvents,
  type SpaceDetailDto,
  type SpaceSnapshot,
} from '@plaza/shared';
import { io as connect, type Socket as ClientSocket } from 'socket.io-client';

import { createChatModule } from '../modules/chat/index.js';
import { modules } from '../modules/index.js';
import { createPresenceModule } from '../modules/presence/index.js';
import type { PlazaModule } from '../modules/types.js';
import { createWorldModule, type WorldService } from '../modules/world/index.js';
import type { JoinRateLimit } from '../modules/world/world.socket.js';
import { buildTestApp, type TestApp, type TestAppOptions } from './app.js';
import type { ManualTimers } from './manual-timers.js';
import { signIn, type TestUser } from './session.js';

export type TestClient = ClientSocket<ServerToClientEvents, ClientToServerEvents>;

/** Every server event a client received, by event name, in order. */
export type Received = { [E in ServerEventName]: ServerEventPayload<E>[] };

function emptyInbox(): Received {
  return {
    'space:snapshot': [],
    'player:correct': [],
    'world:delta': [],
    'media:peers': [],
    'chat:message': [],
    reaction: [],
    'ring:received': [],
    'space:kicked': [],
    'space:theme': [],
    'room:updated': [],
    'desk:updated': [],
    error: [],
  };
}

export interface RealtimeHarnessOptions {
  timers: ManualTimers;
  /** Defaults to no join rate limit (the harness re-joins as a round trip, see `barrier`). */
  joinLimit?: JoinRateLimit;
  /** Real adapters instead of the fakes (e.g. the LiveKit media provider). */
  overrides?: TestAppOptions['overrides'];
}

/**
 * Real app (every module, with the world, presence and chat clocks driven by `ManualTimers`)
 * listening on a random port, plus real Socket.IO clients. For the realtime integration tests of
 * E7 and later.
 */
export class RealtimeHarness {
  testApp!: TestApp;
  world!: WorldService;
  url = '';
  readonly #clients: TestClient[] = [];
  readonly #inboxes = new Map<TestClient, Received>();

  constructor(private readonly options: RealtimeHarnessOptions) {}

  async start(): Promise<void> {
    const { timers } = this.options;
    const joinLimit = this.options.joinLimit ?? { burst: 1_000_000, windowMs: 1000 };
    const replaced: Record<string, PlazaModule> = {
      world: createWorldModule({ timers, joinLimit }),
      presence: createPresenceModule({ timers }),
      chat: createChatModule({ timers }),
    };
    this.testApp = await buildTestApp({
      ...(this.options.overrides !== undefined && { overrides: this.options.overrides }),
      modules: [
        ...modules.map((module) => replaced[module.name] ?? module),
        {
          name: 'capture-world',
          register: ({ services }) => {
            this.world = services.get('world');
          },
        },
      ],
    });
    await this.testApp.app.listen({ host: '127.0.0.1', port: 0 });
    const { port } = this.testApp.app.server.address() as AddressInfo;
    this.url = `http://127.0.0.1:${String(port)}`;
  }

  async stop(): Promise<void> {
    await this.testApp.app.close();
  }

  /** Closes every client and drops every runtime and timer of the test. */
  reset(): void {
    for (const client of this.#clients.splice(0)) client.close();
    this.#inboxes.clear();
    this.world.close();
  }

  /** Ana (owner) creates "Oficina Acme" and the other people join it by invitation. */
  async createSpace(owner: TestUser, members: readonly TestUser[]): Promise<SpaceDetailDto> {
    const created = await this.testApp.app.inject({
      method: 'POST',
      url: API_PATHS.spaces,
      headers: owner.headers,
      payload: { name: 'Oficina Acme', mapTemplateId: 'office-small@1' },
    });
    const space = SpaceResponseSchema.parse(created.json()).space;
    const token = new URL(space.inviteUrl ?? '').pathname.split('/').pop() ?? '';
    for (const member of members) {
      const joined = await this.testApp.app.inject({
        method: 'POST',
        url: apiPath(API_PATHS.join, { token }),
        headers: member.headers,
      });
      if (joined.statusCode !== 200) throw new Error(`join failed: ${joined.body}`);
    }
    return space;
  }

  signIn(email: string, displayName: string): Promise<TestUser> {
    return signIn(this.testApp.app, email, { displayName });
  }

  async open(user: TestUser): Promise<TestClient> {
    const client: TestClient = connect(this.url, {
      path: REALTIME_PATH,
      transports: ['websocket'],
      reconnection: false,
      extraHeaders: { cookie: user.cookie },
    });
    this.#clients.push(client);
    const inbox = emptyInbox();
    this.#inboxes.set(client, inbox);
    client.onAny((event: string, payload: unknown) => {
      if (Object.hasOwn(inbox, event)) (inbox[event as ServerEventName] as unknown[]).push(payload);
    });
    await new Promise<void>((resolve) => client.on('connect', resolve));
    return client;
  }

  inbox(client: TestClient): Received {
    const found = this.#inboxes.get(client);
    if (found === undefined) throw new Error('unknown client');
    return found;
  }

  join(client: TestClient, spaceId: string): Promise<Ack<SpaceSnapshot>> {
    return client.emitWithAck('space:join', { v: PROTOCOL_VERSION, spaceId });
  }

  async enter(
    user: TestUser,
    spaceId: string,
  ): Promise<{ client: TestClient; snapshot: SpaceSnapshot }> {
    const client = await this.open(user);
    const ack = await this.join(client, spaceId);
    if (!ack.ok) throw new Error(`space:join failed: ${ack.error.code}`);
    return { client, snapshot: ack.data };
  }

  /**
   * Waits until the server handled every event these clients sent before, and they got every
   * message sent to them before: re-joining the same space on the same socket is a no-op round
   * trip, and a connection keeps its order both ways.
   */
  async barrier(spaceId: string, ...clients: TestClient[]): Promise<void> {
    for (const client of clients) {
      const ack = await this.join(client, spaceId);
      if (!ack.ok) throw new Error(`barrier failed: ${ack.error.code}`);
    }
  }

  /** One server tick, then lets the given clients receive what it sent. */
  async tick(spaceId: string, ...clients: TestClient[]): Promise<void> {
    this.options.timers.advance(TICK_MS);
    await this.barrier(spaceId, ...clients);
  }
}
