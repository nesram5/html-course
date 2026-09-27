import { describe, expect, it } from 'vitest';

import { computeAdminMetrics, metricsWindow, percentile, type MetricEvent } from '../index.js';

const NOW = new Date('2026-09-27T15:00:00.000Z');
/** 14 days: 2026-09-14 … 2026-09-27 (two weeks). */
const WINDOW = metricsWindow(NOW, 14);

function at(day: string, hour = 10): Date {
  return new Date(`2026-09-${day}T${String(hour).padStart(2, '0')}:00:00.000Z`);
}

function event(
  name: string,
  createdAt: Date,
  extra: Partial<Omit<MetricEvent, 'name' | 'createdAt'>> = {},
): MetricEvent {
  return { name, createdAt, spaceId: 's1', actorId: 'a1', props: null, ...extra };
}

describe('metricsWindow', () => {
  it('covers whole UTC days and whole weeks ending today', () => {
    expect(WINDOW.from.toISOString()).toBe('2026-09-14T00:00:00.000Z');
    expect(WINDOW.to).toBe(NOW);
    expect([WINDOW.days, WINDOW.weeks]).toEqual([14, 2]);
    expect(metricsWindow(NOW, 10)).toMatchObject({ days: 14, weeks: 2 });
  });
});

describe('percentile', () => {
  it('is the nearest-rank percentile', () => {
    const values = Array.from({ length: 20 }, (_, i) => (i + 1) * 100);
    expect(percentile(values, 95)).toBe(1900);
    expect(percentile(values, 50)).toBe(1000);
    expect(percentile([700], 95)).toBe(700);
    expect(percentile([], 95)).toBeNull();
  });
});

describe('computeAdminMetrics (O1–O6)', () => {
  it('returns empty figures without events', () => {
    const metrics = computeAdminMetrics([], WINDOW, new Map());

    expect(metrics.o1).toEqual({ conversations: 0, activeUserDays: 0, perActiveUserPerDay: null });
    expect(metrics.o2).toEqual({ weeks: 2, spaces: [], spacesAtTarget: 0 });
    expect(metrics.o3).toEqual({ samples: 0, p50Ms: null, p95Ms: null });
    expect(metrics.o4).toEqual({ sessions: 0, sessionsWithErrors: 0, rate: null });
    expect(metrics.o6).toEqual({ roomEntries: 0, meetOpened: 0, rate: null });
  });

  it('O1: conversations over 30 s per active person and day', () => {
    const events = [
      // Two people active on the 20th, one on the 21st: 3 person-days.
      event('space_joined', at('20'), { actorId: 'a1' }),
      event('space_joined', at('20', 11), { actorId: 'a1' }),
      event('space_joined', at('20'), { actorId: 'a2' }),
      event('space_joined', at('21'), { actorId: 'a1' }),
      // Six conversation ends: two too short.
      ...[45_000, 31_000, 120_000, 60_000, 30_000, 5000].map((durationMs) =>
        event('conversation_ended', at('20'), { props: { durationMs, maxPeers: 1 } }),
      ),
      event('conversation_started', at('20')),
    ];

    expect(computeAdminMetrics(events, WINDOW, new Map()).o1).toEqual({
      conversations: 4,
      activeUserDays: 3,
      perActiveUserPerDay: 4 / 3,
    });
  });

  it('O2: days of use per week and space, and the spaces at the ≥ 3 days target', () => {
    const joined = (spaceId: string, days: string[]) =>
      days.map((day) => event('space_joined', at(day), { spaceId }));
    const events = [
      ...joined('s1', ['14', '15', '16', '21', '22', '23', '23']),
      ...joined('s2', ['14', '15', '16', '17', '21']),
      // Outside the window.
      ...joined('s2', ['13']),
    ];

    const { o2 } = computeAdminMetrics(events, WINDOW, new Map([['s1', 'Acme']]));

    expect(o2.spacesAtTarget).toBe(1);
    expect(o2.spaces).toEqual([
      { spaceId: 's1', name: 'Acme', daysPerWeek: [3, 3], avgDaysPerWeek: 3, atTarget: true },
      { spaceId: 's2', name: null, daysPerWeek: [4, 1], avgDaysPerWeek: 2.5, atTarget: false },
    ]);
  });

  it('O3 and O5: p50 and p95 of the client samples', () => {
    const events = [
      ...[300, 400, 500, 2000].map((valueMs) =>
        event('av_first_frame', at('20'), { props: { valueMs } }),
      ),
      event('join_time', at('20'), { props: { valueMs: 25_000 } }),
      event('join_time', at('20'), { props: { valueMs: 'x' } }),
    ];

    const metrics = computeAdminMetrics(events, WINDOW, new Map());

    expect(metrics.o3).toEqual({ samples: 4, p50Ms: 400, p95Ms: 2000 });
    expect(metrics.o5).toEqual({ samples: 1, p50Ms: 25_000, p95Ms: 25_000 });
  });

  it('O4: sessions without a critical error', () => {
    const started = (key: string) =>
      event('session_started', at('20'), { props: { sessionKey: key } });
    const failed = (key: string) =>
      event('session_error', at('20'), { props: { sessionKey: key, kind: 'media_lost' } });
    const events = [
      ...['k1', 'k2', 'k3', 'k4'].map(started),
      failed('k2'),
      failed('k2'),
      // An error of a visit not seen starting (e.g. before the window) is not counted.
      failed('k9'),
    ];

    expect(computeAdminMetrics(events, WINDOW, new Map()).o4).toEqual({
      sessions: 4,
      sessionsWithErrors: 1,
      rate: 0.75,
    });
  });

  it('O6: room entries that open Meet', () => {
    const room = { props: { areaId: 'sala-1' } };
    const events = [
      ...['a1', 'a2', 'a3', 'a4'].map((actorId) =>
        event('room_entered', at('20'), { ...room, actorId }),
      ),
      ...['a1', 'a2', 'a3'].map((actorId) =>
        event('room_meet_opened', at('20', 11), { ...room, actorId }),
      ),
    ];

    expect(computeAdminMetrics(events, WINDOW, new Map()).o6).toEqual({
      roomEntries: 4,
      meetOpened: 3,
      rate: 0.75,
    });
  });

  it('O6: counts each visit once and ignores openings without a matching visit', () => {
    const inRoom = (areaId: string) => ({ props: { areaId } });
    const events = [
      // a1: two visits; opens Meet three times in the first (counted once), never in the second.
      event('room_entered', at('20', 9), inRoom('sala-1')),
      event('room_meet_opened', at('20', 10), inRoom('sala-1')),
      event('room_meet_opened', at('20', 10), inRoom('sala-1')),
      event('room_meet_opened', at('20', 11), inRoom('sala-1')),
      event('room_entered', at('21', 9), inRoom('sala-1')),
      // a2: opens a room they did not enter, in another space, and before entering.
      event('room_meet_opened', at('20', 8), { ...inRoom('sala-2'), actorId: 'a2' }),
      event('room_entered', at('20', 9), { ...inRoom('sala-2'), actorId: 'a2' }),
      event('room_meet_opened', at('20', 10), { ...inRoom('sala-1'), actorId: 'a2' }),
      event('room_meet_opened', at('20', 10), {
        ...inRoom('sala-2'),
        actorId: 'a2',
        spaceId: 's2',
      }),
      // Given newest first: the order of the rows does not matter.
    ].reverse();

    expect(computeAdminMetrics(events, WINDOW, new Map()).o6).toEqual({
      roomEntries: 3,
      meetOpened: 1,
      rate: 1 / 3,
    });
  });
});
