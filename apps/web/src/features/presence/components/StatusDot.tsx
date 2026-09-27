import type { EffectivePresence } from '@bululu/shared';

const COLORS: Record<EffectivePresence, string> = {
  available: 'bg-status-available',
  busy: 'bg-status-busy',
  away: 'bg-status-away',
};

export interface StatusDotProps {
  readonly presence: EffectivePresence | 'offline';
  readonly className?: string;
}

/** Green / red / grey dot (RF-11). Decorative: the status is always also written as text. */
export function StatusDot({ presence, className = '' }: StatusDotProps) {
  const color =
    presence === 'offline' ? 'border border-slate-400 bg-transparent' : COLORS[presence];
  return (
    <span
      aria-hidden="true"
      data-presence={presence}
      className={`inline-block size-2.5 shrink-0 rounded-full ${color} ${className}`}
    />
  );
}
