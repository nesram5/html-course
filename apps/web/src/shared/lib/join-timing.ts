import { TELEMETRY_MAX_VALUE_MS } from '@bululu/shared';

/**
 * O5 "tiempo de entrada" (E8-S7): from opening an invitation link to being inside the map. The
 * invitation page marks the start in `sessionStorage`, which survives the Google sign-in round
 * trip in the same tab; the office takes it once joined. Nothing personal is kept.
 */
const KEY = 'bululu.join.startedAt.v1';

type Storage = Pick<globalThis.Storage, 'getItem' | 'setItem' | 'removeItem'>;

function tabStorage(): Storage | null {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

/** The invitation link was opened (kept from the first visit of this tab's journey). */
export function markInviteOpened(now: number = Date.now(), storage = tabStorage()): void {
  try {
    if (storage?.getItem(KEY) === null) storage.setItem(KEY, String(now));
  } catch {
    // Blocked storage: this journey is simply not measured.
  }
}

/**
 * Milliseconds since the invitation link was opened, once: the mark is removed. `null` without a
 * mark, or when it is too old to be the same journey.
 */
export function takeInviteElapsed(now: number = Date.now(), storage = tabStorage()): number | null {
  try {
    const raw = storage?.getItem(KEY) ?? null;
    if (raw === null) return null;
    storage?.removeItem(KEY);
    const elapsed = Math.round(now - Number(raw));
    return Number.isFinite(elapsed) && elapsed >= 0 && elapsed <= TELEMETRY_MAX_VALUE_MS
      ? elapsed
      : null;
  } catch {
    return null;
  }
}
