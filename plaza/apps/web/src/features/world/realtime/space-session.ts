import type { KickReason, SpaceSnapshot } from '@plaza/shared';
import { useStore } from 'zustand';
import { createStore, type StoreApi } from 'zustand/vanilla';

import type { EventBus } from '../bridge/event-bus';
import type { WorldStore } from '../store/world-store';
import {
  isRealtimeRequestError,
  type RealtimeClient,
  type RealtimeErrorCode,
} from './realtime-client';

/** Where the person is in the space, from the realtime point of view. */
export type SpaceSessionState =
  | { readonly kind: 'idle' }
  | { readonly kind: 'joining' }
  | { readonly kind: 'joined' }
  /** `space:kicked`: removed by the owner, or the space was opened in another tab. */
  | { readonly kind: 'kicked'; readonly reason: KickReason }
  /** `space:join` refused (`NOT_A_MEMBER`, `SPACE_FULL`...) or the handshake was refused. */
  | { readonly kind: 'failed'; readonly code: RealtimeErrorCode };

export interface SessionState {
  readonly session: SpaceSessionState;
  set(session: SpaceSessionState): void;
}

export type SessionStore = StoreApi<SessionState>;

export function createSessionStore(): SessionStore {
  return createStore<SessionState>()((set) => ({
    session: { kind: 'idle' },
    set: (session) => {
      set({ session });
    },
  }));
}

/** The app-wide session store, written only by the running `SpaceSession`. */
export const sessionStore = createSessionStore();

export function useSessionStore<T>(
  selector: (state: SessionState) => T,
  store: SessionStore = sessionStore,
): T {
  return useStore(store, selector);
}

export interface SpaceSessionOptions {
  readonly spaceId: string;
  readonly client: RealtimeClient;
  readonly events: EventBus;
  readonly world: WorldStore;
  readonly store?: SessionStore;
}

/**
 * Being in a space in real time (E4-S1, E4-S3, E4-S6), for one visit of the space page:
 * - joins once the socket is connected AND the map is drawn, and re-joins after every
 *   reconnection or redraw; each snapshot goes to the scene (`world:snapshot`);
 * - forwards local steps as `player:move`, and `world:delta` / `player:correct` to the scene,
 *   only while joined;
 * - handles `space:kicked` (no automatic reconnection) and join errors.
 *
 * Framework-free: `useSpaceSession` starts and stops it with the page.
 */
export class SpaceSession {
  private readonly cleanups: (() => void)[] = [];
  private readonly store: SessionStore;
  /** Bumped on every (re)connection or redraw: answers of older joins are ignored. */
  private attempt = 0;
  private joined = false;
  private joining = false;

  constructor(private readonly options: SpaceSessionOptions) {
    this.store = options.store ?? sessionStore;
  }

  get state(): SpaceSessionState {
    return this.store.getState().session;
  }

  start(): void {
    const { client, events, world } = this.options;
    this.store.getState().set({ kind: 'idle' });
    this.cleanups.push(
      client.onConnect(() => {
        this.invalidate();
        this.maybeJoin();
      }),
      client.store.subscribe((connection) => {
        if (connection.status === 'connected') return;
        this.invalidate();
        if (connection.status === 'disconnected' && connection.error !== null && !this.isFinal()) {
          this.store.getState().set({ kind: 'failed', code: connection.error });
        }
      }),
      world.subscribe((state, previous) => {
        if (state.load.kind === previous.load.kind) return;
        if (state.load.kind === 'ready') {
          this.maybeJoin();
        } else if (previous.load.kind === 'ready') {
          // A new game will be drawn: it needs a fresh snapshot.
          this.invalidate();
        }
      }),
      events.on('local:step', (step) => {
        if (this.joined) client.move(step);
      }),
      client.on('world:delta', (delta) => {
        if (this.joined) events.emit('world:delta', delta);
      }),
      client.on('player:correct', (tile) => {
        if (this.joined) events.emit('player:correct', tile);
      }),
      client.on('space:snapshot', (snapshot) => {
        if (snapshot.spaceId === this.options.spaceId && !this.isFinal()) this.apply(snapshot);
      }),
      client.on('space:kicked', ({ reason }) => {
        this.invalidate();
        this.store.getState().set({ kind: 'kicked', reason });
        client.disconnect();
      }),
      client.on('error', (error) => {
        if (error.code === 'PROTOCOL_MISMATCH') this.fail('PROTOCOL_MISMATCH');
        else if (error.code === 'NOT_IN_SPACE') {
          this.invalidate();
          this.maybeJoin();
        }
      }),
    );
    client.connect();
    this.maybeJoin();
  }

  /** Leaves the space page: closes the connection and removes every listener. */
  stop(): void {
    this.invalidate();
    for (const dispose of this.cleanups.splice(0)) dispose();
    this.options.client.disconnect();
    this.store.getState().set({ kind: 'idle' });
  }

  /**
   * "Usar Plaza aquí" after `SESSION_REPLACED`, or "Reintentar" after an error: reconnect and
   * join again (the server then replaces the other tab).
   */
  retry(): void {
    this.invalidate();
    this.store.getState().set({ kind: 'idle' });
    if (this.options.client.connected) this.maybeJoin();
    else this.options.client.connect();
  }

  private isFinal(): boolean {
    const { kind } = this.state;
    return kind === 'kicked' || kind === 'failed';
  }

  private invalidate(): void {
    this.attempt++;
    this.joined = false;
    this.joining = false;
  }

  private maybeJoin(): void {
    const { client, world, spaceId } = this.options;
    if (this.joined || this.joining || this.isFinal()) return;
    if (!client.connected || world.getState().load.kind !== 'ready') return;
    this.joining = true;
    const attempt = this.attempt;
    this.store.getState().set({ kind: 'joining' });
    client.join(spaceId).then(
      (snapshot) => {
        if (attempt !== this.attempt) return;
        this.joining = false;
        this.apply(snapshot);
      },
      (error: unknown) => {
        if (attempt !== this.attempt) return;
        this.joining = false;
        this.fail(isRealtimeRequestError(error) ? error.code : 'INTERNAL');
      },
    );
  }

  private apply(snapshot: SpaceSnapshot): void {
    this.joined = true;
    this.store.getState().set({ kind: 'joined' });
    this.options.events.emit('world:snapshot', snapshot);
  }

  private fail(code: RealtimeErrorCode): void {
    this.invalidate();
    this.store.getState().set({ kind: 'failed', code });
  }
}
