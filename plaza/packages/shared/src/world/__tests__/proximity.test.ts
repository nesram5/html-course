import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { MAX_PEERS, PROXIMITY_HYSTERESIS, PROXIMITY_RADIUS } from '../../constants.js';
import {
  changedPeers,
  computePeers,
  DEFAULT_PROXIMITY_CONFIG,
  type PeerMap,
  type ProximityConfig,
  type ProximityPlayer,
} from '../proximity.js';

function player(
  userId: string,
  x: number,
  y: number,
  extra: Partial<ProximityPlayer> = {},
): ProximityPlayer {
  return { userId, x, y, roomId: null, status: 'available', ...extra };
}

function peersOf(result: PeerMap, userId: string): string[] {
  return [...(result.get(userId) ?? [])].sort();
}

const NONE: ReadonlyMap<string, ReadonlySet<string>> = new Map();

describe('computePeers (E5-S1)', () => {
  it('uses the game constants by default (radius 3, hysteresis 1, max 8 peers)', () => {
    expect(DEFAULT_PROXIMITY_CONFIG).toEqual({
      radius: PROXIMITY_RADIUS,
      hysteresis: PROXIMITY_HYSTERESIS,
      maxPeers: MAX_PEERS,
    });
    expect([PROXIMITY_RADIUS, PROXIMITY_HYSTERESIS, MAX_PEERS]).toEqual([3, 1, 8]);
  });

  describe('radius and hysteresis (RN-01, RN-02)', () => {
    it('connects A and B 3 tiles apart as mutual peers', () => {
      const result = computePeers([player('a', 0, 0), player('b', 3, 0)], NONE);
      expect(peersOf(result, 'a')).toEqual(['b']);
      expect(peersOf(result, 'b')).toEqual(['a']);
    });

    it('uses euclidean distance: (2,2) is within 3 tiles, (3,1) is not', () => {
      expect(peersOf(computePeers([player('a', 0, 0), player('b', 2, 2)], NONE), 'a')).toEqual([
        'b',
      ]);
      // sqrt(10) ≈ 3.16 > 3
      expect(peersOf(computePeers([player('a', 0, 0), player('b', 3, 1)], NONE), 'a')).toEqual([]);
    });

    it('keeps A and B connected at 4 tiles only if they already were (hysteresis)', () => {
      const players = [player('a', 0, 0), player('b', 4, 0)];
      expect(peersOf(computePeers(players, NONE), 'a')).toEqual([]);

      const connected = new Map([
        ['a', new Set(['b'])],
        ['b', new Set(['a'])],
      ]);
      const kept = computePeers(players, connected);
      expect(peersOf(kept, 'a')).toEqual(['b']);
      expect(peersOf(kept, 'b')).toEqual(['a']);
    });

    it('treats a one-sided previous entry as connected (prev symmetric by construction)', () => {
      const players = [player('a', 0, 0), player('b', 4, 0)];
      const kept = computePeers(players, new Map([['b', new Set(['a'])]]));
      expect(peersOf(kept, 'a')).toEqual(['b']);
      expect(peersOf(kept, 'b')).toEqual(['a']);
    });

    it('disconnects A and B at 5 tiles even if they were connected', () => {
      const connected = new Map([
        ['a', new Set(['b'])],
        ['b', new Set(['a'])],
      ]);
      const result = computePeers([player('a', 0, 0), player('b', 5, 0)], connected);
      expect(peersOf(result, 'a')).toEqual([]);
      expect(peersOf(result, 'b')).toEqual([]);
    });

    it('walks A away from B step by step: 3 connect, 4 keep, 5 drop, 4 stays dropped', () => {
      const b = player('b', 0, 0);
      let prev: PeerMap = new Map();
      const connectedAt = (x: number): boolean => {
        prev = computePeers([player('a', x, 0), b], prev);
        return peersOf(prev, 'a').includes('b');
      };
      expect([3, 4, 5, 4, 3].map(connectedAt)).toEqual([true, true, false, false, true]);
    });
  });

  it('connects A–B and B–C but not A–C when they stand in a row 3 tiles apart', () => {
    const result = computePeers([player('a', 0, 0), player('b', 3, 0), player('c', 6, 0)], NONE);
    expect(peersOf(result, 'a')).toEqual(['b']);
    expect(peersOf(result, 'b')).toEqual(['a', 'c']);
    expect(peersOf(result, 'c')).toEqual(['b']);
  });

  describe('exclusions (RN-03, RN-04)', () => {
    const wasConnected = new Map([
      ['a', new Set(['b'])],
      ['b', new Set(['a'])],
    ]);

    it('does not connect anyone to a busy person, even if they were talking', () => {
      const players = [player('a', 0, 0), player('b', 1, 0, { status: 'busy' })];
      for (const prev of [NONE, wasConnected]) {
        const result = computePeers(players, prev);
        expect(peersOf(result, 'a')).toEqual([]);
        expect(peersOf(result, 'b')).toEqual([]);
      }
    });

    it('does not connect anyone to a person inside a meeting room, even if they were talking', () => {
      const players = [player('a', 0, 0), player('b', 1, 0, { roomId: 'sala-1' })];
      for (const prev of [NONE, wasConnected]) {
        const result = computePeers(players, prev);
        expect(peersOf(result, 'a')).toEqual([]);
        expect(peersOf(result, 'b')).toEqual([]);
      }
    });

    it('does not connect two people standing in the same meeting room', () => {
      const result = computePeers(
        [player('a', 0, 0, { roomId: 'sala-1' }), player('b', 1, 0, { roomId: 'sala-1' })],
        NONE,
      );
      expect(peersOf(result, 'a')).toEqual([]);
    });

    it('returns an (empty) entry for every player, including excluded ones', () => {
      const result = computePeers(
        [player('a', 0, 0), player('b', 20, 0, { status: 'busy' }), player('c', 0, 20)],
        NONE,
      );
      expect([...result.keys()].sort()).toEqual(['a', 'b', 'c']);
      expect(computePeers([], NONE).size).toBe(0);
    });
  });

  describe('cap of 8 peers, closest first (RN-07)', () => {
    // A in the middle; 4 at distance 1, 4 diagonal at √2 and 3 at distance 2.
    const group = [
      player('a', 10, 10),
      player('n1', 10, 9),
      player('n2', 11, 10),
      player('n3', 10, 11),
      player('n4', 9, 10),
      player('d1', 11, 9),
      player('d2', 11, 11),
      player('d3', 9, 11),
      player('d4', 9, 9),
      player('f1', 12, 10),
      player('f2', 8, 10),
      player('f3', 10, 12),
    ];

    it('gives nobody more than 8 peers among 12 people together', () => {
      expect(group).toHaveLength(12);
      const result = computePeers(group, NONE);
      for (const peers of result.values()) expect(peers.size).toBeLessThanOrEqual(8);
    });

    it('keeps the closest people as peers', () => {
      const result = computePeers(group, NONE);
      expect(peersOf(result, 'a')).toEqual(['d1', 'd2', 'd3', 'd4', 'n1', 'n2', 'n3', 'n4']);
    });

    it('respects a custom cap', () => {
      const result = computePeers(group, NONE, { ...DEFAULT_PROXIMITY_CONFIG, maxPeers: 2 });
      for (const peers of result.values()) expect(peers.size).toBeLessThanOrEqual(2);
      expect(peersOf(result, 'a')).toHaveLength(2);
    });

    it('breaks distance ties in favour of existing conversations', () => {
      const trio = [player('a', 0, 0), player('b', 1, 0), player('c', -1, 0)];
      const cfg: ProximityConfig = { ...DEFAULT_PROXIMITY_CONFIG, maxPeers: 1 };
      const withC = computePeers(trio, new Map([['a', new Set(['c'])]]), cfg);
      expect(peersOf(withC, 'a')).toEqual(['c']);
      const withB = computePeers(trio, new Map([['a', new Set(['b'])]]), cfg);
      expect(peersOf(withB, 'a')).toEqual(['b']);
    });
  });

  describe('properties', () => {
    const cfgArb: fc.Arbitrary<ProximityConfig> = fc.record({
      radius: fc.integer({ min: 1, max: 5 }),
      hysteresis: fc.integer({ min: 0, max: 2 }),
      maxPeers: fc.integer({ min: 1, max: 8 }),
    });

    const playersArb: fc.Arbitrary<ProximityPlayer[]> = fc
      .array(
        fc.record({
          x: fc.integer({ min: 0, max: 12 }),
          y: fc.integer({ min: 0, max: 12 }),
          roomId: fc.option(fc.constantFrom('sala-1', 'sala-2'), { freq: 4 }),
          status: fc.constantFrom('available' as const, 'available' as const, 'busy' as const),
        }),
        { maxLength: 30 },
      )
      .map((rows) => rows.map((row, i) => ({ userId: `u${String(i)}`, ...row })));

    /** A previous result: an arbitrary symmetric relation over the same ids. */
    function prevArb(n: number): fc.Arbitrary<PeerMap> {
      return fc
        .array(fc.tuple(fc.nat({ max: Math.max(0, n - 1) }), fc.nat({ max: Math.max(0, n - 1) })))
        .map((pairs) => {
          const prev: PeerMap = new Map();
          for (const [i, j] of pairs) {
            if (i === j || n === 0) continue;
            const a = `u${String(i)}`;
            const b = `u${String(j)}`;
            prev.set(a, (prev.get(a) ?? new Set()).add(b));
            prev.set(b, (prev.get(b) ?? new Set()).add(a));
          }
          return prev;
        });
    }

    const scenarioArb = fc
      .tuple(playersArb, cfgArb)
      .chain(([players, cfg]) => prevArb(players.length).map((prev) => ({ players, cfg, prev })));

    const dist = (a: ProximityPlayer, b: ProximityPlayer): number =>
      Math.hypot(a.x - b.x, a.y - b.y);

    it('is always symmetric', () => {
      fc.assert(
        fc.property(scenarioArb, ({ players, cfg, prev }) => {
          const result = computePeers(players, prev, cfg);
          for (const [a, peers] of result) {
            for (const b of peers) expect(result.get(b)?.has(a)).toBe(true);
            expect(peers.has(a)).toBe(false);
          }
        }),
      );
    });

    it('never gives peers to someone in a room or busy', () => {
      fc.assert(
        fc.property(scenarioArb, ({ players, cfg, prev }) => {
          const result = computePeers(players, prev, cfg);
          for (const p of players) {
            if (p.roomId !== null || p.status === 'busy') {
              expect(result.get(p.userId)?.size).toBe(0);
            }
          }
        }),
      );
    });

    it('respects the cap and the distance rules', () => {
      fc.assert(
        fc.property(scenarioArb, ({ players, cfg, prev }) => {
          const result = computePeers(players, prev, cfg);
          const byId = new Map(players.map((p) => [p.userId, p]));
          for (const [id, peers] of result) {
            expect(peers.size).toBeLessThanOrEqual(cfg.maxPeers);
            const a = byId.get(id)!;
            for (const peerId of peers) {
              const d = dist(a, byId.get(peerId)!);
              const wasConnected =
                prev.get(id)?.has(peerId) === true || prev.get(peerId)?.has(id) === true;
              expect(d).toBeLessThanOrEqual(
                wasConnected ? cfg.radius + cfg.hysteresis : cfg.radius,
              );
            }
          }
        }),
      );
    });

    it('only drops an in-range pair when one of them is full of closer (or equal) peers', () => {
      fc.assert(
        fc.property(scenarioArb, ({ players, cfg, prev }) => {
          const result = computePeers(players, prev, cfg);
          const byId = new Map(players.map((p) => [p.userId, p]));
          const eligible = players.filter((p) => p.roomId === null && p.status !== 'busy');
          const fullWithin = (p: ProximityPlayer, d: number): boolean => {
            const peers = result.get(p.userId)!;
            return (
              peers.size === cfg.maxPeers && [...peers].every((q) => dist(p, byId.get(q)!) <= d)
            );
          };
          for (const a of eligible) {
            for (const b of eligible) {
              if (a.userId >= b.userId) continue;
              const d = dist(a, b);
              if (d > cfg.radius || result.get(a.userId)!.has(b.userId)) continue;
              expect(fullWithin(a, d) || fullWithin(b, d)).toBe(true);
            }
          }
        }),
      );
    });

    it('does not modify its inputs', () => {
      fc.assert(
        fc.property(scenarioArb, ({ players, cfg, prev }) => {
          const playersCopy = players.map((p) => ({ ...p }));
          const prevCopy = new Map([...prev].map(([k, v]) => [k, new Set(v)]));
          computePeers(players, prev, cfg);
          expect(players).toEqual(playersCopy);
          expect(prev).toEqual(prevCopy);
        }),
      );
    });
  });

  it('micro-benchmark: 50 players take < 1 ms on average', () => {
    // Deterministic pseudo-random crowd on a 30×20 hallway (dense enough to hit the cap).
    let seed = 42;
    const random = (): number => {
      seed = (seed * 1_103_515_245 + 12_345) % 2_147_483_648;
      return seed / 2_147_483_648;
    };
    const players = Array.from({ length: 50 }, (_, i) =>
      player(`user-${String(i)}`, Math.floor(random() * 30), Math.floor(random() * 20), {
        status: i % 10 === 0 ? 'busy' : 'available',
        roomId: i % 7 === 0 ? 'sala-1' : null,
      }),
    );

    let prev = computePeers(players, NONE);
    for (let i = 0; i < 200; i++) prev = computePeers(players, prev); // warm-up

    const iterations = 2000;
    const start = Date.now();
    for (let i = 0; i < iterations; i++) {
      // Move one person per tick, like the real server does.
      const moving = players[i % players.length]!;
      players[i % players.length] = { ...moving, x: (moving.x + 1) % 30 };
      prev = computePeers(players, prev);
    }
    const averageMs = (Date.now() - start) / iterations;
    expect(averageMs).toBeLessThan(1);
  });
});

describe('changedPeers (E5-S2)', () => {
  const map = (entries: Record<string, string[]>): PeerMap =>
    new Map(Object.entries(entries).map(([id, peers]) => [id, new Set(peers)]));

  it('lists only the people whose set changed, with sorted peers', () => {
    const prev = map({ a: ['b'], b: ['a'], c: [], d: ['e'], e: ['d'] });
    const next = map({ a: ['c', 'b'], b: ['a'], c: ['a'], d: ['e'], e: ['d'] });
    expect(changedPeers(prev, next)).toEqual([
      { userId: 'a', peers: ['b', 'c'] },
      { userId: 'c', peers: ['a'] },
    ]);
  });

  it('treats a missing previous entry as no peers', () => {
    const next = map({ a: [], b: ['c'], c: ['b'] });
    expect(changedPeers(NONE, next)).toEqual([
      { userId: 'b', peers: ['c'] },
      { userId: 'c', peers: ['b'] },
    ]);
  });

  it('tells whoever lost every peer (empty list) and ignores people who left', () => {
    const prev = map({ a: ['b'], b: ['a'] });
    const next = map({ a: [] });
    expect(changedPeers(prev, next)).toEqual([{ userId: 'a', peers: [] }]);
  });

  it('always lists the forced people (joined or reconnected), even without changes', () => {
    const prev = map({ a: ['b'], b: ['a'], c: [] });
    const next = map({ a: ['b'], b: ['a'], c: [] });
    expect(changedPeers(prev, next, new Set(['b', 'c']))).toEqual([
      { userId: 'b', peers: ['a'] },
      { userId: 'c', peers: [] },
    ]);
  });

  it('detects a swap with the same size', () => {
    expect(changedPeers(map({ a: ['b'] }), map({ a: ['c'] }))).toEqual([
      { userId: 'a', peers: ['c'] },
    ]);
  });
});
