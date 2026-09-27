import {
  CONVERSATION_MIN_MS,
  type AdminMetricsResponse,
  type DurationStats,
  type SpaceUsage,
} from '@bululu/shared';

const DAY_MS = 24 * 60 * 60 * 1000;
/** O2: a team "uses Bululu" in a week with at least this many days of use (brief §3). */
export const O2_DAYS_PER_WEEK_TARGET = 3;

/** What the metrics read of a `ProductEvent` row. */
export interface MetricEvent {
  readonly name: string;
  readonly spaceId: string | null;
  readonly actorId: string | null;
  readonly props: unknown;
  readonly createdAt: Date;
}

/** Whole UTC days, ending with the day of `now`, covering whole weeks. */
export interface MetricsWindow {
  readonly from: Date;
  readonly to: Date;
  readonly days: number;
  readonly weeks: number;
}

export function metricsWindow(now: Date, requestedDays: number): MetricsWindow {
  const weeks = Math.max(1, Math.ceil(requestedDays / 7));
  const days = weeks * 7;
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return { from: new Date(today - (days - 1) * DAY_MS), to: now, days, weeks };
}

function prop(props: unknown, key: string): unknown {
  return typeof props === 'object' && props !== null ? Reflect.get(props, key) : undefined;
}

function numberProp(props: unknown, key: string): number | null {
  const value = prop(props, key);
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function stringProp(props: unknown, key: string): string | null {
  const value = prop(props, key);
  return typeof value === 'string' ? value : null;
}

/** Nearest-rank percentile of `values` (0 < p ≤ 100), `null` without values. */
export function percentile(values: readonly number[], p: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.max(1, Math.ceil((p / 100) * sorted.length));
  return sorted[Math.min(rank, sorted.length) - 1] ?? null;
}

function durationStats(values: readonly number[]): DurationStats {
  return { samples: values.length, p50Ms: percentile(values, 50), p95Ms: percentile(values, 95) };
}

function ratio(part: number, whole: number): number | null {
  return whole === 0 ? null : Math.min(1, Math.max(0, part / whole));
}

function dayIndex(window: MetricsWindow, at: Date): number {
  return Math.floor((at.getTime() - window.from.getTime()) / DAY_MS);
}

/**
 * The O1–O6 figures of the brief (§3) from the product events of the window (pure: the caller
 * loads the events, the space names and the feedback). Days are UTC days.
 *
 * - O1: `conversation_ended` longer than 30 s (each person of a conversation has one) divided by
 *   the person-days with at least one `space_joined`.
 * - O2: days with at least one `space_joined` in each week, per space.
 * - O3 / O5: p50 and p95 of the client samples `av_first_frame` / `join_time`.
 * - O4: `session_started` visits minus the ones with a `session_error` (a cut not recovered in
 *   30 s), over the visits.
 * - O6: `room_entered` visits with at least one `room_meet_opened` of the same person, space and
 *   room after the entry and before their next one, over the visits. Clicking "Unirse a la
 *   reunión" twice counts once, and openings with no matching visit (a forged or stale event)
 *   do not count, so the figure is a true share of visits.
 */
export function computeAdminMetrics(
  events: readonly MetricEvent[],
  window: MetricsWindow,
  spaceNames: ReadonlyMap<string, string>,
): Omit<AdminMetricsResponse, 'feedback'> {
  let conversations = 0;
  const activeUserDays = new Set<string>();
  const usageDays = new Map<string, Set<number>>();
  const firstFrames: number[] = [];
  const joinTimes: number[] = [];
  const sessions = new Set<string>();
  const failedSessions = new Set<string>();
  let roomEntries = 0;
  let meetOpened = 0;
  /** O6: the latest room visit of each person in each space (`actorId|spaceId`). */
  const visits = new Map<string, { areaId: string | null; opened: boolean }>();

  const ordered = [...events].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  for (const event of ordered) {
    const day = dayIndex(window, event.createdAt);
    if (day < 0 || day >= window.days) continue;
    switch (event.name) {
      case 'space_joined': {
        if (event.actorId !== null) activeUserDays.add(`${event.actorId}|${String(day)}`);
        if (event.spaceId !== null) {
          const days = usageDays.get(event.spaceId) ?? new Set<number>();
          days.add(day);
          usageDays.set(event.spaceId, days);
        }
        break;
      }
      case 'conversation_ended': {
        if ((numberProp(event.props, 'durationMs') ?? 0) > CONVERSATION_MIN_MS) conversations++;
        break;
      }
      case 'av_first_frame':
      case 'join_time': {
        const value = numberProp(event.props, 'valueMs');
        if (value !== null) (event.name === 'join_time' ? joinTimes : firstFrames).push(value);
        break;
      }
      case 'session_started':
      case 'session_error': {
        const key = stringProp(event.props, 'sessionKey');
        if (key !== null) (event.name === 'session_started' ? sessions : failedSessions).add(key);
        break;
      }
      case 'room_entered': {
        roomEntries++;
        if (event.actorId !== null) {
          visits.set(`${event.actorId}|${String(event.spaceId)}`, {
            areaId: stringProp(event.props, 'areaId'),
            opened: false,
          });
        }
        break;
      }
      case 'room_meet_opened': {
        const visit =
          event.actorId === null
            ? undefined
            : visits.get(`${event.actorId}|${String(event.spaceId)}`);
        const areaId = stringProp(event.props, 'areaId');
        if (visit === undefined || visit.opened) break;
        if (visit.areaId !== null && areaId !== null && visit.areaId !== areaId) break;
        visit.opened = true;
        meetOpened++;
        break;
      }
      default:
        break;
    }
  }

  const spaces: SpaceUsage[] = [...usageDays.entries()]
    .map(([spaceId, days]) => {
      const daysPerWeek = Array.from(
        { length: window.weeks },
        (_, week) => [...days].filter((day) => Math.floor(day / 7) === week).length,
      );
      return {
        spaceId,
        name: spaceNames.get(spaceId) ?? null,
        daysPerWeek,
        avgDaysPerWeek: days.size / window.weeks,
        atTarget: daysPerWeek.every((count) => count >= O2_DAYS_PER_WEEK_TARGET),
      };
    })
    .sort((a, b) => b.avgDaysPerWeek - a.avgDaysPerWeek || a.spaceId.localeCompare(b.spaceId));
  const sessionsWithErrors = [...failedSessions].filter((key) => sessions.has(key)).length;

  return {
    from: window.from.toISOString(),
    to: window.to.toISOString(),
    days: window.days,
    o1: {
      conversations,
      activeUserDays: activeUserDays.size,
      perActiveUserPerDay: activeUserDays.size === 0 ? null : conversations / activeUserDays.size,
    },
    o2: {
      weeks: window.weeks,
      spaces,
      spacesAtTarget: spaces.filter((space) => space.atTarget).length,
    },
    o3: durationStats(firstFrames),
    o4: {
      sessions: sessions.size,
      sessionsWithErrors,
      rate: ratio(sessions.size - sessionsWithErrors, sessions.size),
    },
    o5: durationStats(joinTimes),
    o6: { roomEntries, meetOpened, rate: ratio(meetOpened, roomEntries) },
  };
}
