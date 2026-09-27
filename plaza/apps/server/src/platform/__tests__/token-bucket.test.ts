import { describe, expect, it } from 'vitest';

import { InMemoryRealtimeMetrics } from '../metrics.js';
import { KeyedTokenBuckets, TokenBucket } from '../token-bucket.js';

describe('KeyedTokenBuckets', () => {
  it('limits each key on its own and forgets keys once their bucket is full again', () => {
    let now = 0;
    const buckets = new KeyedTokenBuckets({ capacity: 2, refillPerSecond: 1, now: () => now });
    expect([buckets.tryTake('a'), buckets.tryTake('a'), buckets.tryTake('a')]).toEqual([
      true,
      true,
      false,
    ]);
    expect(buckets.tryTake('b')).toBe(true);
    expect(buckets.size).toBe(2);

    now += 1000; // one token back for "a"
    expect(buckets.tryTake('a')).toBe(true);
    expect(buckets.tryTake('a')).toBe(false);

    now += 2000; // both idle for the full refill time
    expect(buckets.tryTake('c')).toBe(true);
    expect(buckets.size).toBe(1);
  });
});

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
});
