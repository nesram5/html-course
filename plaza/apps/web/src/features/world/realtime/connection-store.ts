import type { ErrorCode } from '@plaza/shared';
import { useStore } from 'zustand';
import { createStore, type StoreApi } from 'zustand/vanilla';

/**
 * State of the realtime connection (E4-S1, E4-S6):
 * - `connecting`: first connection attempt;
 * - `connected`: the socket is up (joining the space is the session's job);
 * - `reconnecting`: the connection dropped and Socket.IO is retrying on its own;
 * - `disconnected`: closed on purpose, by the server, or refused (see `error`).
 */
export type ConnectionStatus = 'connecting' | 'connected' | 'reconnecting' | 'disconnected';

export interface ConnectionState {
  readonly status: ConnectionStatus;
  /** Why the last handshake was refused (`UNAUTHORIZED`...), `null` otherwise. */
  readonly error: ErrorCode | null;
  setStatus(status: ConnectionStatus, error?: ErrorCode | null): void;
}

export type ConnectionStore = StoreApi<ConnectionState>;

export function createConnectionStore(): ConnectionStore {
  return createStore<ConnectionState>()((set) => ({
    status: 'disconnected',
    error: null,
    setStatus: (status, error = null) => {
      set({ status, error });
    },
  }));
}

/** The app-wide connection store, written only by the `RealtimeClient`. */
export const connectionStore = createConnectionStore();

/** React binding of {@link connectionStore} (or of another store, in tests). */
export function useConnectionStore<T>(
  selector: (state: ConnectionState) => T,
  store: ConnectionStore = connectionStore,
): T {
  return useStore(store, selector);
}
