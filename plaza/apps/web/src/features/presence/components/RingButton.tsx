import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { isRealtimeRequestError, realtimeClient } from '@/features/world';
import { toast } from '@/shared/ui';

import { requestNotificationPermissionOnce } from '../lib/ring-alert';
import { ringStore, secondsLeft, useRingStore, type RingStore } from '../store/ring-store';

export interface RingButtonProps {
  readonly userId: string;
  readonly displayName: string;
  /** Sends `ring:send`; defaults to the app realtime client. */
  readonly ring?: (userId: string) => Promise<void>;
  readonly store?: RingStore;
  readonly className?: string;
}

const defaultRing = (userId: string) => realtimeClient.ring(userId);

/**
 * "Llamar" (E7-S5): rings a person (sound + browser notification on their side). The first use
 * asks for the notification permission. Disabled with a countdown for 30 s after each ring to
 * the same person (RN-11, also enforced by the server).
 */
export function RingButton({
  userId,
  displayName,
  ring = defaultRing,
  store = ringStore,
  className = '',
}: RingButtonProps) {
  const { t } = useTranslation('presence');
  const { t: tc } = useTranslation();
  const until = useRingStore((state) => state.until[userId], store);
  const [now, setNow] = useState(() => Date.now());
  const [sending, setSending] = useState(false);
  const seconds = secondsLeft(until, now);

  // Countdown: refresh the clock now (another button may have started the cooldown) and then
  // every second until the person can be rung again.
  useEffect(() => {
    if (until === undefined) return undefined;
    const tick = () => {
      const current = Date.now();
      setNow(current);
      if (current >= until) clearInterval(timer);
    };
    const first = setTimeout(tick, 0);
    const timer = setInterval(tick, 1000);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, [until]);

  const onClick = async () => {
    requestNotificationPermissionOnce();
    setSending(true);
    try {
      await ring(userId);
      const current = Date.now();
      setNow(current);
      store.getState().started(userId, current);
      toast.success(t('ring.sent', { name: displayName }));
    } catch (error) {
      const code = isRealtimeRequestError(error) ? error.code : 'INTERNAL';
      if (code === 'RING_COOLDOWN') {
        const current = Date.now();
        setNow(current);
        store.getState().started(userId, current);
      }
      toast.error(tc(`errors.${code}`));
    } finally {
      setSending(false);
    }
  };

  const waiting = seconds > 0;
  return (
    <button
      type="button"
      disabled={waiting || sending}
      aria-label={
        waiting
          ? t('ring.cooldownLabel', { name: displayName, seconds })
          : t('ring.label', { name: displayName })
      }
      className={`rounded-md bg-brand-600 px-2 py-1 text-xs font-medium text-white hover:bg-brand-700 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-600 ${className}`}
      onClick={() => {
        void onClick();
      }}
    >
      {waiting ? t('ring.cooldown', { seconds }) : t('ring.button')}
    </button>
  );
}
