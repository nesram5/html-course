import { useTranslation } from 'react-i18next';

import type { ConnectionStatus } from '../realtime/connection-store';
import type { SpaceSessionState } from '../realtime/space-session';

export interface ConnectionBannerProps {
  readonly connection: ConnectionStatus;
  readonly session: SpaceSessionState;
}

/**
 * Floating notice over the map (E4-S6): "Reconectando…" while the connection is down and
 * Socket.IO retries, "Conectando…" until the first snapshot. Nothing once joined.
 */
export function ConnectionBanner({ connection, session }: ConnectionBannerProps) {
  const { t } = useTranslation('world');
  let text: string | null = null;
  if (connection === 'reconnecting') text = t('connection.reconnecting');
  else if (session.kind === 'idle' || session.kind === 'joining') text = t('connection.connecting');

  return (
    <div
      role="status"
      data-testid="connection-banner"
      data-connection={connection}
      data-session={session.kind}
      className="pointer-events-none absolute inset-x-0 top-3 flex justify-center"
    >
      {text !== null && (
        <p className="rounded-full bg-slate-900/85 px-4 py-1.5 text-sm font-medium text-white shadow">
          {text}
        </p>
      )}
    </div>
  );
}
