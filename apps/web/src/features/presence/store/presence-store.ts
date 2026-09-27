import {
  effectivePresence,
  type EffectivePresence,
  type PlayerChanged,
  type PresenceStatus,
  type PublicPlayer,
  type SpaceSnapshot,
  type WorldDelta,
} from '@bululu/shared';
import { useStore } from 'zustand';
import { createStore, type StoreApi } from 'zustand/vanilla';

/** What the presence UI needs about a connected person (no position: it changes 15 times/s). */
export interface PresencePerson {
  readonly userId: string;
  readonly displayName: string;
  readonly avatarId: string;
  readonly status: PresenceStatus;
  readonly away: boolean;
  /** Meeting room the person is in (`null` in the hallway). */
  readonly roomId: string | null;
  /** Connection lost, within the 30 s grace (E4-S6). */
  readonly reconnecting: boolean;
}

export interface PresenceState {
  /** The local person, from the last snapshot; `null` before joining. */
  readonly selfId: string | null;
  /** Connected people by userId, the local person included. */
  readonly people: Readonly<Record<string, PresencePerson>>;
  /** Status chosen by the local person (RF-11): what the status menu shows. */
  readonly status: PresenceStatus;
  /** Whether the local person is away right now (hidden tab or inactivity, RN-05). */
  readonly away: boolean;
  applySnapshot(snapshot: SpaceSnapshot): void;
  applyDelta(delta: WorldDelta): void;
  setStatus(status: PresenceStatus): void;
  setAway(away: boolean): void;
  /** Leaving the space page. */
  reset(): void;
}

export type PresenceStore = StoreApi<PresenceState>;

function toPerson(player: PublicPlayer): PresencePerson {
  return {
    userId: player.userId,
    displayName: player.displayName,
    avatarId: player.avatarId,
    status: player.status,
    away: player.away,
    roomId: player.roomId,
    reconnecting: player.reconnecting,
  };
}

function merge(person: PresencePerson, changed: PlayerChanged): PresencePerson {
  return {
    ...person,
    displayName: changed.displayName ?? person.displayName,
    avatarId: changed.avatarId ?? person.avatarId,
    status: changed.status ?? person.status,
    away: changed.away ?? person.away,
    roomId: changed.roomId === undefined ? person.roomId : changed.roomId,
    reconnecting: changed.reconnecting ?? person.reconnecting,
  };
}

/**
 * Who is in the space and how they are (E7-S1, E7-S2), fed by `world:snapshot` and the
 * non-positional parts of `world:delta` (steps are ignored, so walking does not re-render panels).
 */
export function createPresenceStore(): PresenceStore {
  return createStore<PresenceState>()((set, get) => ({
    selfId: null,
    people: {},
    status: 'available',
    away: false,
    applySnapshot: (snapshot) => {
      const people: Record<string, PresencePerson> = {};
      for (const player of [snapshot.self, ...snapshot.players]) {
        people[player.userId] = toPerson(player);
      }
      set({ selfId: snapshot.self.userId, people, status: snapshot.self.status });
    },
    applyDelta: (delta) => {
      if (delta.joined.length + delta.left.length + delta.changed.length === 0) return;
      const left = new Set(delta.left);
      const people: Record<string, PresencePerson> = {};
      for (const [userId, person] of Object.entries(get().people)) {
        if (!left.has(userId)) people[userId] = person;
      }
      for (const player of delta.joined) people[player.userId] = toPerson(player);
      for (const changed of delta.changed) {
        const person = people[changed.userId];
        if (person !== undefined) people[changed.userId] = merge(person, changed);
      }
      set({ people });
    },
    setStatus: (status) => {
      set({ status });
    },
    setAway: (away) => {
      set({ away });
    },
    reset: () => {
      set({ selfId: null, people: {}, away: false });
    },
  }));
}

/** The app-wide presence store. */
export const presenceStore = createPresenceStore();

export function usePresenceStore<T>(
  selector: (state: PresenceState) => T,
  store: PresenceStore = presenceStore,
): T {
  return useStore(store, selector);
}

/** A connected person as the video tiles and panels show them. */
export interface PresenceOf extends PresencePerson {
  /** Green / red / grey dot: the chosen status, or away. */
  readonly presence: EffectivePresence;
  readonly isSelf: boolean;
}

/**
 * Presence of a connected person, `null` when they are not connected. For the video tiles of
 * the media feature: `away` → "Ausente · Llamar" card (E7-S1; see `AwayCard`).
 */
export function usePresenceOf(
  userId: string,
  store: PresenceStore = presenceStore,
): PresenceOf | null {
  const person = useStore(store, (state) => state.people[userId]);
  const selfId = useStore(store, (state) => state.selfId);
  if (person === undefined) return null;
  return { ...person, presence: effectivePresence(person), isSelf: person.userId === selfId };
}
