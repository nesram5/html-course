import type { PresenceStatus, RingReceived } from '@plaza/shared';

import type { EventBus, RealtimeClient } from '@/features/world';

import type { PresenceStore } from '../store/presence-store';

export interface PresenceSessionOptions {
  readonly client: Pick<RealtimeClient, 'on' | 'setAway' | 'setStatus'>;
  readonly events: EventBus;
  readonly store: PresenceStore;
  /** Whether the realtime session is in the space now (events sent before are refused). */
  readonly isJoined: () => boolean;
  /** Someone rang the local person (sound, notification, toast). */
  readonly onRing: (ring: RingReceived) => void;
}

/**
 * Presence of the local person while in a space (E7-S1, E7-S5), framework-free:
 * - keeps the presence store in sync with `world:snapshot` / `world:delta`;
 * - sends the chosen status and the away flag, and tells the rest of the app when the person
 *   becomes away or comes back (`presence:self-away`: the media feature mutes / restores);
 * - whatever changed while not in the space (joining, reconnecting) is sent after the next
 *   snapshot: the away flag when the server has another one, and a status chosen meanwhile;
 * - hands incoming rings to `onRing`.
 */
export class PresenceSession {
  private readonly cleanups: (() => void)[] = [];
  /** Status chosen while not in the space, sent after the next snapshot. */
  private pendingStatus: PresenceStatus | null = null;

  constructor(private readonly options: PresenceSessionOptions) {}

  start(): void {
    const { client, events, store } = this.options;
    this.cleanups.push(
      events.on('world:snapshot', (snapshot) => {
        const state = store.getState();
        state.applySnapshot(snapshot);
        if (snapshot.self.away !== state.away) client.setAway(state.away);
        const pending = this.pendingStatus;
        this.pendingStatus = null;
        if (pending !== null && pending !== snapshot.self.status) {
          state.setStatus(pending);
          client.setStatus(pending);
        }
      }),
      events.on('world:delta', (delta) => {
        store.getState().applyDelta(delta);
      }),
      client.on('ring:received', (ring) => {
        this.options.onRing(ring);
      }),
    );
  }

  stop(): void {
    for (const dispose of this.cleanups.splice(0)) dispose();
    this.pendingStatus = null;
    this.options.store.getState().reset();
  }

  /** Status menu: available / busy for everyone, kept for the next visits. */
  setStatus(status: PresenceStatus): void {
    const { store, client, isJoined } = this.options;
    store.getState().setStatus(status);
    if (isJoined()) client.setStatus(status);
    else this.pendingStatus = status;
  }

  /** From the activity detection: hidden tab / idle, or back. */
  setAway(away: boolean): void {
    const { store, client, events, isJoined } = this.options;
    if (store.getState().away === away) return;
    store.getState().setAway(away);
    if (isJoined()) client.setAway(away);
    events.emit('presence:self-away', { away });
  }
}
