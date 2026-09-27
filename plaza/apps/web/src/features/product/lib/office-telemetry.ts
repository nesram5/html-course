import { CRITICAL_OUTAGE_MS, type TelemetrySample } from '@plaza/shared';
import type { StoreApi } from 'zustand/vanilla';

import type { MediaState } from '@/features/media';
import type { ConnectionState, SessionState } from '@/features/world';
import { takeInviteElapsed } from '@/shared/lib/join-timing';

import { newSessionKey } from './telemetry';

export interface OfficeTelemetryDeps {
  readonly spaceId: string;
  /** The world's realtime session (`joined`, `kicked`…). */
  readonly session: StoreApi<SessionState>;
  /** The realtime socket connection. */
  readonly connection: StoreApi<ConnectionState>;
  /** The hallway media (connection and first-frame samples). */
  readonly media: StoreApi<MediaState>;
  readonly record: (sample: TelemetrySample) => void;
  /** Milliseconds since the invitation link was opened (O5), taken once. */
  readonly takeJoinElapsed?: () => number | null;
  readonly sessionKey?: string;
}

/**
 * Client measurements of one visit of the office (E8-S7), from the world and media stores:
 * - `session_started` once joined, and `join_time` when the visit started from an invitation
 *   link (O5);
 * - `session_error` when the realtime connection or the hallway media stay lost longer than
 *   {@link CRITICAL_OUTAGE_MS} (RNF-04 promises recovery within 30 s) — once per outage (O4);
 * - `av_first_frame` for every "entered proximity → first video frame" the media records (O3).
 * Being removed from the space, or the same person opening another tab, is not an error.
 */
export class OfficeTelemetry {
  readonly #deps: OfficeTelemetryDeps;
  readonly #sessionKey: string;
  #cleanups: (() => void)[] = [];
  #joined = false;
  #ended = false;
  #connectionTimer: ReturnType<typeof setTimeout> | null = null;
  #mediaTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(deps: OfficeTelemetryDeps) {
    this.#deps = deps;
    this.#sessionKey = deps.sessionKey ?? newSessionKey();
  }

  start(): void {
    const { session, connection, media } = this.#deps;
    this.#cleanups = [
      session.subscribe((state) => {
        this.#onSession(state);
      }),
      connection.subscribe((state) => {
        this.#onConnection(state);
      }),
      media.subscribe((state, previous) => {
        this.#onMedia(state, previous);
      }),
    ];
    this.#onSession(session.getState());
  }

  stop(): void {
    for (const cleanup of this.#cleanups.splice(0)) cleanup();
    this.#clear('connection');
    this.#clear('media');
  }

  #onSession(state: SessionState): void {
    const { kind } = state.session;
    if (kind === 'kicked' || kind === 'failed') {
      // Removed, replaced by another tab or refused: the visit is over, not broken.
      this.#ended = true;
      this.#clear('connection');
      this.#clear('media');
      return;
    }
    if (kind !== 'joined' || this.#joined) return;
    this.#joined = true;
    const { spaceId, record } = this.#deps;
    record({ metric: 'session_started', spaceId, sessionKey: this.#sessionKey });
    const elapsed = (this.#deps.takeJoinElapsed ?? takeInviteElapsed)();
    if (elapsed !== null) record({ metric: 'join_time', spaceId, valueMs: elapsed });
  }

  #onConnection(state: ConnectionState): void {
    if (!this.#joined || this.#ended) return;
    if (state.status === 'connected') this.#clear('connection');
    else this.#arm('connection', 'connection_lost');
  }

  #onMedia(state: MediaState, previous: MediaState): void {
    if (state.firstFrameMs !== previous.firstFrameMs) {
      const last = state.firstFrameMs.at(-1);
      if (last !== undefined && state.firstFrameMs.length > 0) {
        this.#deps.record({
          metric: 'av_first_frame',
          spaceId: this.#deps.spaceId,
          valueMs: Math.round(last),
        });
      }
    }
    if (state.connection === previous.connection || this.#ended) return;
    if (state.connection === 'reconnecting') this.#arm('media', 'media_lost');
    else this.#clear('media');
  }

  #arm(which: 'connection' | 'media', kind: 'connection_lost' | 'media_lost'): void {
    if ((which === 'connection' ? this.#connectionTimer : this.#mediaTimer) !== null) return;
    const timer = setTimeout(() => {
      if (which === 'connection') this.#connectionTimer = null;
      else this.#mediaTimer = null;
      this.#deps.record({
        metric: 'session_error',
        spaceId: this.#deps.spaceId,
        sessionKey: this.#sessionKey,
        kind,
      });
    }, CRITICAL_OUTAGE_MS);
    if (which === 'connection') this.#connectionTimer = timer;
    else this.#mediaTimer = timer;
  }

  #clear(which: 'connection' | 'media'): void {
    const timer = which === 'connection' ? this.#connectionTimer : this.#mediaTimer;
    if (timer !== null) clearTimeout(timer);
    if (which === 'connection') this.#connectionTimer = null;
    else this.#mediaTimer = null;
  }
}
