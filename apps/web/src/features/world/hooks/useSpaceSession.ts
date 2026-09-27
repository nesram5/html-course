import { useCallback, useEffect, useRef } from 'react';

import { worldEvents } from '../bridge/event-bus';
import { useConnectionStore, type ConnectionStatus } from '../realtime/connection-store';
import { realtimeClient } from '../realtime/realtime-client';
import {
  SpaceSession,
  sessionStore,
  useSessionStore,
  type SpaceSessionState,
} from '../realtime/space-session';
import { worldStore } from '../store/world-store';

export interface SpaceSessionHandle {
  readonly session: SpaceSessionState;
  readonly connection: ConnectionStatus;
  /** Reconnect and join again ("Usar Bululu aquí", "Reintentar"). */
  readonly retry: () => void;
}

/**
 * Connects to the realtime server and joins the space while the page is mounted (E4-S1, E4-S6).
 * `spaceId` is `undefined` until the space is known; nothing connects before.
 */
export function useSpaceSession(spaceId: string | undefined): SpaceSessionHandle {
  const sessionRef = useRef<SpaceSession | null>(null);

  useEffect(() => {
    if (spaceId === undefined) return undefined;
    const session = new SpaceSession({
      spaceId,
      client: realtimeClient,
      events: worldEvents,
      world: worldStore,
      store: sessionStore,
    });
    sessionRef.current = session;
    session.start();
    return () => {
      session.stop();
      if (sessionRef.current === session) sessionRef.current = null;
    };
  }, [spaceId]);

  const session = useSessionStore((state) => state.session);
  const connection = useConnectionStore((state) => state.status, realtimeClient.store);
  const retry = useCallback(() => {
    sessionRef.current?.retry();
  }, []);
  return { session, connection, retry };
}
