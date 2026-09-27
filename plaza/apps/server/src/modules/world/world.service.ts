import { performance } from 'node:perf_hooks';

import {
  PROTOCOL_VERSION,
  RECONNECT_GRACE_MS,
  TICK_MS,
  type DeskState,
  type KickReason,
  type MeetingRoomDto,
  type PeersChange,
  type PlayerMove,
  type SpaceSnapshot,
  type WorldDelta,
} from '@plaza/shared';
import type { DisconnectReason } from 'socket.io';

import type { ErrorReporter } from '../../platform/error-reporter.js';
import { AppError } from '../../platform/errors.js';
import { KeyedSerial } from '../../platform/keyed-serial.js';
import type { Logger } from '../../platform/logger.js';
import type { MapsCatalog } from '../../platform/maps-catalog.js';
import type { InMemoryRealtimeMetrics } from '../../platform/metrics.js';
import type { PlazaIo, PlazaSocket } from '../../platform/socket.js';
import type { CancelTimer, Timers } from '../../platform/timers.js';
import type { TokenBucket } from '../../platform/token-bucket.js';
import { socketUserId } from '../auth/index.js';
import type { EventsService } from '../events/index.js';
import type { MediaService } from '../media/index.js';
import type { SpacesService } from '../spaces/index.js';
import { HallwayPeers } from './hallway-peers.js';
import { SpaceRuntime, type MoveResult } from './space-runtime.js';
import { InMemorySpaceStateStore, type SpaceStateStore } from './space-state-store.js';
import type { WorldRepository } from './world.repository.js';

/**
 * Disconnect reasons of a connection ended on purpose, not by the network: by the client
 * ("Salir", leaving the page) or by the server (logout; kicked and replaced sockets have left
 * the runtime already).
 */
const DELIBERATE_REASONS: readonly DisconnectReason[] = [
  'client namespace disconnect',
  'server namespace disconnect',
];

/** A `space:join` in progress; `kickedFor` is set when the person is removed meanwhile. */
interface PendingJoin {
  readonly spaceId: string;
  readonly userId: string;
  kickedFor: KickReason | null;
}

/** Socket.IO room with every connection of a space. */
export function spaceRoom(spaceId: string): string {
  return `space:${spaceId}`;
}

export interface WorldServiceDeps {
  io: PlazaIo;
  repository: WorldRepository;
  spaces: SpacesService;
  maps: MapsCatalog;
  media: MediaService;
  /** Product events (E6-S2, E8-S7): entering the map, hallway conversations and `room_entered`. */
  events: Pick<EventsService, 'record'>;
  metrics: InMemoryRealtimeMetrics;
  timers: Timers;
  logger: Logger;
  reporter: ErrorReporter;
  /** RN-06: `MAX_PLAYERS_PER_SPACE` (lowered by tests through the config). */
  maxPlayersPerSpace: number;
}

/**
 * The part of a delta a given person receives:
 * - their own steps are left out (they already know them);
 * - so are their own arrival and the arrivals before it in the same tick (their snapshot
 *   already had them; `joined` keeps arrival order). The steps and changes those arrivals made
 *   after the snapshot still reach them through `moved` / `changed`;
 * - the arrivals they do get whole in `joined` carry their latest state, so their `moved` and
 *   `changed` entries are left out.
 * `left` goes to everyone, and so does `changed` of the person (their `roomId`, computed by the
 * server).
 */
export function deltaFor(delta: WorldDelta, userId: string): WorldDelta | null {
  const ownArrival = delta.joined.findIndex((player) => player.userId === userId);
  const joined = ownArrival === -1 ? delta.joined : delta.joined.slice(ownArrival + 1);
  const whole = new Set<string>();
  for (const player of joined) whole.add(player.userId);
  const moved = delta.moved.filter((entry) => entry.userId !== userId && !whole.has(entry.userId));
  const changed =
    whole.size === 0 ? delta.changed : delta.changed.filter((entry) => !whole.has(entry.userId));
  const { left } = delta;
  if (moved.length + joined.length + left.length + changed.length === 0) return null;
  return { moved, joined, left, changed };
}

/**
 * Realtime world use cases (E4): entering a space, movement, the tick, reconnection grace and
 * removal of kicked people. One {@link SpaceRuntime} per space in a {@link SpaceStateStore}.
 */
export class WorldService {
  readonly store: SpaceStateStore;
  readonly #tickers = new Map<SpaceRuntime, CancelTimer>();
  /** Pending "left" of disconnected people, by `spaceId:userId` (E4-S6). */
  readonly #graceTimers = new Map<string, CancelTimer>();
  /** `space:join` calls still loading: a kick meanwhile makes them fail. */
  readonly #pendingJoins = new Set<PendingJoin>();
  /** Hallway conversations of each loaded space (E5-S2). */
  readonly #hallways = new WeakMap<SpaceRuntime, HallwayPeers>();
  /** Media-server permission changes, one at a time per `spaceId:userId` (E6-S3). */
  readonly #publishing = new KeyedSerial();
  /** `spaceId:userId` of the people whose permission to publish is revoked right now. */
  readonly #revoked = new Set<string>();

  constructor(private readonly deps: WorldServiceDeps) {
    this.store = new InMemorySpaceStateStore({
      timers: deps.timers,
      load: (spaceId) => this.#load(spaceId),
      onLoad: (runtime) => {
        this.#tickers.set(
          runtime,
          deps.timers.every(TICK_MS, () => {
            this.tick(runtime);
          }),
        );
      },
      onUnload: (runtime) => {
        this.#tickers.get(runtime)?.();
        this.#tickers.delete(runtime);
        deps.metrics.setConnected(runtime.spaceId, 0);
        deps.metrics.setInConversation(runtime.spaceId, 0);
      },
    });
  }

  // ── space:join (E4-S1) ──────────────────────────────────────────────────

  /**
   * Enters the space: members only (`NOT_A_MEMBER`), at most `maxPlayersPerSpace` people
   * (`SPACE_FULL`), one avatar per person (a second tab replaces the first with
   * `space:kicked { SESSION_REPLACED }`), and someone reconnecting within the grace period gets
   * their avatar back where it was (E4-S6). Returns the `space:snapshot`.
   */
  async join(socket: PlazaSocket, spaceId: string): Promise<SpaceSnapshot> {
    const userId = socketUserId(socket);
    const pending: PendingJoin = { spaceId, userId, kickedFor: null };
    this.#pendingJoins.add(pending);
    try {
      return await this.#join(socket, pending);
    } finally {
      this.#pendingJoins.delete(pending);
    }
  }

  async #join(socket: PlazaSocket, pending: PendingJoin): Promise<SpaceSnapshot> {
    const { spaceId, userId } = pending;
    const member = await this.deps.repository.findMember(spaceId, userId);
    if (member === null) throw new AppError('NOT_A_MEMBER', 'Space not found');
    const space = await this.deps.spaces.spaceWithRooms(spaceId);
    // Loading (or finding) the runtime cancels its pending release: from here on, every way out
    // but entering releases it again if it is still empty (E4-S2).
    const loading = this.store.getOrLoad(spaceId);
    let rooms: MeetingRoomDto[];
    let desks: DeskState[];
    try {
      [rooms, desks] = await Promise.all([
        this.deps.spaces.rooms(space),
        this.deps.repository.occupiedDesks(spaceId),
      ]);
    } catch (error) {
      loading.then(
        () => {
          this.store.unloadIfEmpty(spaceId);
        },
        () => undefined,
      );
      throw error;
    }
    const runtime = await loading;

    // Synchronous from here on: no other event interleaves with the checks below.
    try {
      this.#assertCanEnter(socket, pending, runtime);
    } catch (error) {
      this.store.unloadIfEmpty(spaceId);
      throw error;
    }
    if (socket.data.spaceId !== undefined && socket.data.spaceId !== spaceId) {
      this.leave(socket);
    }
    const previousSocketId = runtime.socketOf(userId);
    if (runtime.has(userId)) {
      this.#cancelGrace(spaceId, userId);
      runtime.reconnect(userId, socket.id);
      if (previousSocketId !== null && previousSocketId !== socket.id) {
        this.#replace(previousSocketId);
      }
    } else {
      const { deskId, ...profile } = member;
      runtime.join(
        { ...profile, away: false, inConversation: false },
        runtime.spawnFor(deskId),
        socket.id,
      );
      // A new visit of the map (not a reconnection nor a second tab): O2 days of use, O1 people.
      this.deps.events.record('space_joined', { spaceId, userId });
    }
    if (previousSocketId !== socket.id) this.#hallway(runtime).resend(userId);
    socket.data.spaceId = spaceId;
    void socket.join(spaceRoom(spaceId));
    this.#updateConnected(runtime);

    const self = runtime.get(userId);
    if (self === undefined) throw new Error('The player vanished while joining');
    return {
      v: PROTOCOL_VERSION,
      spaceId,
      mapTemplateId: space.mapTemplateId,
      themeId: space.themeId,
      self,
      players: runtime.players().filter((player) => player.userId !== userId),
      rooms,
      desks,
    };
  }

  /**
   * Last checks of `space:join`, once everything is loaded: the connection is still open, the
   * person was not removed from the space meanwhile (the kick could not reach a socket that was
   * not in the space yet), and there is room for a new avatar (RN-06).
   */
  #assertCanEnter(socket: PlazaSocket, pending: PendingJoin, runtime: SpaceRuntime): void {
    if (!socket.connected) {
      throw new AppError('NOT_IN_SPACE', 'The connection closed while joining');
    }
    if (pending.kickedFor !== null) {
      // Told like any other kick, unless the socket is still in another space.
      if (socket.data.spaceId === undefined || socket.data.spaceId === pending.spaceId) {
        socket.emit('space:kicked', { reason: pending.kickedFor });
        socket.disconnect(true);
      }
      throw new AppError('NOT_A_MEMBER', 'Space not found');
    }
    if (!runtime.has(pending.userId) && runtime.size >= this.deps.maxPlayersPerSpace) {
      throw new AppError('SPACE_FULL', 'The space is full');
    }
  }

  /** The socket leaves its space at once, without grace (it joined another space). */
  leave(socket: PlazaSocket): void {
    const { spaceId, userId } = socket.data;
    if (spaceId === undefined || userId === undefined) return;
    void socket.leave(spaceRoom(spaceId));
    delete socket.data.spaceId;
    const runtime = this.store.get(spaceId);
    if (runtime?.socketOf(userId) !== socket.id) return;
    this.#remove(runtime, userId);
  }

  /**
   * The runtime of the space this socket joined, and its person; `NOT_IN_SPACE` when the socket
   * has not joined (or was replaced by a newer tab). Used by the presence and chat handlers.
   */
  joinedRuntime(socket: PlazaSocket): { runtime: SpaceRuntime; userId: string } {
    const userId = socketUserId(socket);
    const { spaceId } = socket.data;
    const runtime = spaceId === undefined ? undefined : this.store.get(spaceId);
    if (runtime?.socketOf(userId) !== socket.id) {
      throw new AppError('NOT_IN_SPACE', 'Join the space first');
    }
    return { runtime, userId };
  }

  /** The live socket of a person in a space, `undefined` when not connected. */
  socketOf(runtime: SpaceRuntime, userId: string): PlazaSocket | undefined {
    const socketId = runtime.socketOf(userId);
    return socketId === null ? undefined : this.deps.io.sockets.sockets.get(socketId);
  }

  // ── player:move (E4-S3) ─────────────────────────────────────────────────

  /**
   * One step: rate-limited (10/s) and validated against the map. Rejected steps are answered
   * with `player:correct` (the position the server keeps); accepted ones reach the others on the
   * next tick. Entering or leaving a meeting room is handled by {@link roomChanged}.
   */
  move(socket: PlazaSocket, bucket: TokenBucket, move: PlayerMove): void {
    const { runtime, userId } = this.joinedRuntime(socket);
    const current = runtime.get(userId);
    if (current === undefined) throw new AppError('NOT_IN_SPACE');
    if (!bucket.tryTake()) {
      socket.emit('player:correct', { x: current.x, y: current.y });
      return;
    }
    const result = runtime.move(userId, move);
    if (!result.ok) {
      socket.emit('player:correct', { x: result.x, y: result.y });
      return;
    }
    this.roomChanged(runtime, userId, result);
  }

  // ── Meeting rooms (E6) ──────────────────────────────────────────────────

  /** `true` when the person is in the space and standing in a meeting room. */
  inMeetingRoom(spaceId: string, userId: string): boolean {
    return (this.store.get(spaceId)?.get(userId)?.roomId ?? null) !== null;
  }

  /**
   * After a step or a server placement (`desk:goto`): when the meeting room changed (the new
   * `roomId` already travels in the next `world:delta`, E6-S1), `room_entered` is recorded on
   * entry (metric O6) and the media server follows (E6-S3): inside a room the person's tracks
   * are muted and they may not publish; back in the hallway they may publish again.
   */
  roomChanged(runtime: SpaceRuntime, userId: string, result: MoveResult): void {
    if (!result.ok || result.roomChanged === undefined) return;
    const { spaceId } = runtime;
    const { roomId } = result.roomChanged;
    if (roomId !== null) {
      // Written in the background by the events service; a failed write is only reported.
      this.deps.events.record('room_entered', { spaceId, userId, props: { areaId: roomId } });
    }
    this.#syncPublishing(spaceId, userId);
  }

  /**
   * The media server says the person connected or published (its webhook, E6-S3). Muting and
   * revoking on room entry act only on a participant who is connected at that moment; someone
   * who connects afterwards with a token fetched in the hallway could publish. If they stand in a
   * meeting room now, their tracks are muted and publishing revoked again, in the same queue as
   * every other permission change of the person, so it never overtakes a later exit.
   */
  mediaParticipantActive(spaceId: string, userId: string): void {
    const key = `${spaceId}:${userId}`;
    void this.#publishing.run(key, async () => {
      if (!this.inMeetingRoom(spaceId, userId)) return;
      this.#revoked.add(key);
      try {
        await this.deps.media.enterMeetingRoom(spaceId, userId);
      } catch (error) {
        this.deps.logger.warn({ err: error, spaceId }, 'World media isolation on connect failed');
        this.deps.reporter.captureException(error, { spaceId });
      }
    });
  }

  /**
   * Brings the media-server permission of a person in line with where they are NOW (not where
   * they were when the change was queued), one change at a time: walking in and out quickly
   * never leaves someone in the hallway unable to publish, nor someone in a room able to.
   */
  #syncPublishing(spaceId: string, userId: string): void {
    const key = `${spaceId}:${userId}`;
    void this.#publishing.run(key, async () => {
      const inRoom = this.inMeetingRoom(spaceId, userId);
      if (inRoom === this.#revoked.has(key)) return;
      if (inRoom) this.#revoked.add(key);
      else this.#revoked.delete(key);
      try {
        await (inRoom
          ? this.deps.media.enterMeetingRoom(spaceId, userId)
          : this.deps.media.leaveMeetingRoom(spaceId, userId));
      } catch (error) {
        this.deps.logger.warn(
          { err: error, spaceId },
          `World ${inRoom ? 'media isolation on room entry' : 'media release on room exit'} failed`,
        );
        this.deps.reporter.captureException(error, { spaceId });
      }
    });
  }

  // ── Disconnection and kicks (E4-S6, E2-S6) ──────────────────────────────

  /**
   * Connection lost: the avatar stays, flagged `reconnecting`, and leaves only if the person
   * does not come back within {@link RECONNECT_GRACE_MS}. A deliberate leave (the client closed
   * the socket itself: "Salir", leaving the page; or the server did: logout) is not a network
   * cut, so the avatar leaves at once. Replaced or kicked sockets are ignored.
   */
  disconnected(socket: PlazaSocket, reason?: DisconnectReason): void {
    const { spaceId, userId } = socket.data;
    if (spaceId === undefined || userId === undefined) return;
    const runtime = this.store.get(spaceId);
    if (runtime?.socketOf(userId) !== socket.id) return;
    if (reason !== undefined && DELIBERATE_REASONS.includes(reason)) {
      this.#remove(runtime, userId);
      return;
    }
    runtime.disconnect(userId);
    this.#updateConnected(runtime);
    this.#cancelGrace(spaceId, userId);
    this.#graceTimers.set(
      `${spaceId}:${userId}`,
      this.deps.timers.after(RECONNECT_GRACE_MS, () => {
        this.#graceTimers.delete(`${spaceId}:${userId}`);
        if (runtime.socketOf(userId) === null) this.#remove(runtime, userId);
      }),
    );
  }

  /**
   * A member was removed (listener of `SpaceNotifier.kick`, called before their sockets are
   * disconnected): the avatar leaves at once, with no reconnection grace, and they are dropped
   * from the media room.
   */
  kicked(spaceId: string, userId: string, reason: KickReason): void {
    if (reason !== 'SESSION_REPLACED') {
      for (const pending of this.#pendingJoins) {
        if (pending.spaceId === spaceId && pending.userId === userId) pending.kickedFor = reason;
      }
    }
    const runtime = this.store.get(spaceId);
    if (runtime !== undefined) this.#remove(runtime, userId);
    if (reason !== 'SESSION_REPLACED') {
      this.#background('media removal on kick', spaceId, () =>
        this.deps.media.removeParticipant(spaceId, userId),
      );
    }
  }

  // ── Tick (E4-S4) ────────────────────────────────────────────────────────

  /**
   * One tick of a space: when something changed, every connected person gets ONE `world:delta`
   * (without their own steps); nothing is sent on idle ticks. Hallway peers are recomputed first
   * (their `inConversation` changes travel in the same delta) and `media:peers` goes only to the
   * people whose peers changed (E5-S2). The duration of working ticks feeds `GET /api/health`
   * (E8-S1).
   */
  tick(runtime: SpaceRuntime): void {
    if (!runtime.hasPendingChanges && !this.#hallway(runtime).pending) return;
    const started = performance.now();
    try {
      const hallway = this.#hallway(runtime);
      const peers = hallway.update(runtime);
      this.deps.metrics.setInConversation(runtime.spaceId, hallway.inConversationCount);
      const delta = runtime.flush() ?? { moved: [], joined: [], left: [], changed: [] };
      const sockets = this.deps.io.sockets.sockets;
      for (const { userId, socketId } of runtime.connections()) {
        const payload = deltaFor(delta, userId);
        if (payload !== null) sockets.get(socketId)?.emit('world:delta', payload);
      }
      this.#sendMediaPeers(runtime, peers);
    } catch (error) {
      this.deps.logger.error({ err: error, spaceId: runtime.spaceId }, 'World tick failed');
      this.deps.reporter.captureException(error, { spaceId: runtime.spaceId });
    } finally {
      this.deps.metrics.recordTick(performance.now() - started);
    }
  }

  /** Stops every tick and timer (server shutdown). */
  close(): void {
    for (const cancel of this.#graceTimers.values()) cancel();
    this.#graceTimers.clear();
    this.store.close();
  }

  // ── Hallway media (E5-S2) ───────────────────────────────────────────────

  /** Current hallway peers of a person (tests and diagnostics). */
  hallwayPeers(spaceId: string, userId: string): string[] {
    const runtime = this.store.get(spaceId);
    return runtime === undefined ? [] : this.#hallway(runtime).peersOf(userId);
  }

  #hallway(runtime: SpaceRuntime): HallwayPeers {
    let hallway = this.#hallways.get(runtime);
    if (hallway === undefined) {
      const { spaceId } = runtime;
      const { events } = this.deps;
      hallway = new HallwayPeers(
        {
          started: (userId) => {
            events.record('conversation_started', { spaceId, userId });
          },
          ended: (userId, durationMs, maxPeers) => {
            events.record('conversation_ended', {
              spaceId,
              userId,
              props: { durationMs, maxPeers },
            });
          },
        },
        () => this.deps.timers.now(),
      );
      this.#hallways.set(runtime, hallway);
    }
    return hallway;
  }

  /** `media:peers` to each connected person whose peers changed; counted for `/api/health`. */
  #sendMediaPeers(runtime: SpaceRuntime, changes: readonly PeersChange[]): void {
    const sockets = this.deps.io.sockets.sockets;
    let sent = 0;
    for (const { userId, peers } of changes) {
      const socketId = runtime.socketOf(userId);
      const socket = socketId === null ? undefined : sockets.get(socketId);
      if (socket === undefined) continue;
      socket.emit('media:peers', { peers });
      sent++;
    }
    this.deps.metrics.recordMediaPeers(sent);
  }

  // ── Internals ───────────────────────────────────────────────────────────

  async #load(spaceId: string): Promise<SpaceRuntime> {
    const space = await this.deps.spaces.spaceWithRooms(spaceId);
    const map = await this.deps.maps.worldMap(space.mapTemplateId);
    return new SpaceRuntime(spaceId, space.mapTemplateId, map);
  }

  /** The older tab of the same person: told why, then disconnected (E4-S1). */
  #replace(socketId: string): void {
    const previous = this.deps.io.sockets.sockets.get(socketId);
    if (previous === undefined) return;
    previous.emit('space:kicked', { reason: 'SESSION_REPLACED' });
    previous.disconnect(true);
  }

  #remove(runtime: SpaceRuntime, userId: string): void {
    this.#cancelGrace(runtime.spaceId, userId);
    runtime.leave(userId);
    // Left from inside a meeting room: publishing is allowed again for their next visit.
    if (this.#revoked.has(`${runtime.spaceId}:${userId}`)) {
      this.#syncPublishing(runtime.spaceId, userId);
    }
    this.#updateConnected(runtime);
    this.store.unloadIfEmpty(runtime.spaceId);
  }

  #cancelGrace(spaceId: string, userId: string): void {
    const key = `${spaceId}:${userId}`;
    this.#graceTimers.get(key)?.();
    this.#graceTimers.delete(key);
  }

  #updateConnected(runtime: SpaceRuntime): void {
    this.deps.metrics.setConnected(runtime.spaceId, runtime.connectedCount);
  }

  /** Media side effects never block or fail the realtime path: log and report instead. */
  #background(what: string, spaceId: string, task: () => Promise<void>): void {
    task().catch((error: unknown) => {
      this.deps.logger.warn({ err: error, spaceId }, `World ${what} failed`);
      this.deps.reporter.captureException(error, { spaceId });
    });
  }
}
