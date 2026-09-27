import type { PresenceStatus } from '../contracts/http/common.js';

/**
 * What the others see of a person (RF-11): the chosen status, unless they are away (hidden tab
 * or inactivity, RN-05), which wins. Drawn as a green / red / grey dot.
 */
export type EffectivePresence = PresenceStatus | 'away';

export function effectivePresence(player: {
  readonly status: PresenceStatus;
  readonly away: boolean;
}): EffectivePresence {
  return player.away ? 'away' : player.status;
}
