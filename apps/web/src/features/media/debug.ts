import type { MediaConnection, MediaStore } from './store/media-store';

/** Read-only probe of the hallway media, for E2E tests and debugging (development only). */
export interface MediaDebug {
  state(): {
    connection: MediaConnection;
    micOn: boolean;
    cameraOn: boolean;
    peers: readonly string[];
    subscribed: readonly string[];
    participants: string[];
    firstFrameMs: readonly number[];
  };
}

declare global {
  interface Window {
    __bululuMedia?: MediaDebug;
  }
}

/** Installs `window.__bululuMedia` (never in production builds); returns the uninstaller. */
export function installMediaDebug(store: MediaStore): () => void {
  if (!import.meta.env.DEV) return () => undefined;
  const probe: MediaDebug = {
    state: () => {
      const state = store.getState();
      return {
        connection: state.connection,
        micOn: state.micOn,
        cameraOn: state.cameraOn,
        peers: state.peers,
        subscribed: state.subscribed,
        participants: Object.keys(state.participants),
        firstFrameMs: state.firstFrameMs,
      };
    },
  };
  window.__bululuMedia = probe;
  return () => {
    if (window.__bululuMedia === probe) delete window.__bululuMedia;
  };
}
