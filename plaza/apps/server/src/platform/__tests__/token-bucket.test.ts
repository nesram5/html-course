import { describe, expect, it } from 'vitest';

import { InMemoryRealtimeMetrics } from '../metrics.js';
import { TokenBucket } from '../token-bucket.js';

describe('TokenBucket', () => {
  it('allows a burst up to capacity and refills over time', () => {
    let now = 0;
    const bucket = new TokenBucket({ capacity: 10, refillPerSecond: 10, now: () => now });
    const accepted = Array.from({ length: 12 }, () => bucket.tryTake()).filter(Boolean);
    expect(accepted).toHaveLength(10);

    now += 100; // one token refilled
    expect(bucket.tryTake()).toBe(true);
    expect(bucket.tryTake()).toBe(false);

    now += 10_000; // never above capacity
    expect(Array.from({ length: 12 }, () => bucket.tryTake()).filter(Boolean)).toHaveLength(10);
  });
});

describe('InMemoryRealtimeMetrics', () => {
  it('tracks connected people and the average tick', () => {
    const metrics = new InMemoryRealtimeMetrics();
    expect(metrics.avgTickMs()).toBeNull();
    metrics.setConnected('s1', 3);
    metrics.setConnected('s2', 1);
    metrics.setConnected('s2', 0);
    metrics.recordTick(2);
    metrics.recordTick(4);
    expect(metrics.connectedBySpace()).toEqual({ s1: 3 });
    expect(metrics.avgTickMs()).toBe(3);
  });

  it('averages the media:peers sent per tick over the last 100 ticks (E5-S2)', () => {
    const metrics = new InMemoryRealtimeMetrics();
    expect(metrics.avgMediaPeersPerTick()).toBeNull();
    metrics.recordMediaPeers(10);
    for (let i = 0; i < 100; i++) metrics.recordMediaPeers(i % 2 === 0 ? 1 : 3);
    expect(metrics.avgMediaPeersPerTick()).toBe(2);
  });
});
