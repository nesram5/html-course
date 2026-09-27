import type { PresenceStatus } from '@plaza/shared';
import { useCallback, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';

import { realtimeClient, sessionStore, worldEvents } from '@/features/world';
import { toast } from '@/shared/ui';

import { showRingAlert } from '../lib/ring-alert';
import { PresenceSession } from '../realtime/presence-session';
import { presenceStore } from '../store/presence-store';
import { usePresenceActivity } from './usePresenceActivity';

/** The running presence session, so the status menu can reach it. */
let current: PresenceSession | null = null;

/** Changes the chosen status of the local person (no-op outside a space). */
export function setPresenceStatus(status: PresenceStatus): void {
  current?.setStatus(status);
}

/**
 * Presence while the space page is mounted (E7-S1, E7-S5): store in sync with the world, away
 * detection (hidden tab, 10 min idle), status changes and incoming rings.
 */
export function usePresenceSession(spaceId: string): void {
  const { t } = useTranslation('presence');
  const translate = useRef(t);
  useEffect(() => {
    translate.current = t;
  }, [t]);

  const sessionRef = useRef<PresenceSession | null>(null);
  useEffect(() => {
    const session = new PresenceSession({
      client: realtimeClient,
      events: worldEvents,
      store: presenceStore,
      isJoined: () => sessionStore.getState().session.kind === 'joined',
      onRing: (ring) => {
        const title = translate.current('ring.incoming', { name: ring.fromDisplayName });
        toast.info(title);
        showRingAlert(ring, { title, body: translate.current('ring.notificationBody') });
      },
    });
    sessionRef.current = session;
    current = session;
    session.start();
    return () => {
      session.stop();
      if (current === session) current = null;
      sessionRef.current = null;
    };
  }, [spaceId]);

  const onAway = useCallback((away: boolean) => {
    sessionRef.current?.setAway(away);
  }, []);
  usePresenceActivity(onAway);
}
