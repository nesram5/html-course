function nearestRank(sorted: readonly number[], p: number): number | null {
  if (sorted.length === 0) return null;
  const rank = Math.ceil((p / 100) * sorted.length);
  return sorted[Math.min(sorted.length, Math.max(1, rank)) - 1] ?? null;
}

/** Nearest-rank percentile (`p` in 0..100) of unsorted samples; `null` without samples. */
export function percentile(samples: readonly number[], p: number): number | null {
  return nearestRank(
    [...samples].sort((a, b) => a - b),
    p,
  );
}

export interface LatencySummary {
  samples: number;
  p50: number | null;
  p95: number | null;
  p99: number | null;
  max: number | null;
}

/** Sorts once; safe for hundreds of thousands of samples (no spread into `Math.max`). */
export function summarize(samples: readonly number[]): LatencySummary {
  const sorted = [...samples].sort((a, b) => a - b);
  return {
    samples: sorted.length,
    p50: nearestRank(sorted, 50),
    p95: nearestRank(sorted, 95),
    p99: nearestRank(sorted, 99),
    max: sorted.at(-1) ?? null,
  };
}

interface SentStep {
  x: number;
  y: number;
  at: number;
}

/** Steps kept per bot to match incoming deltas (a delta carries the last step of a tick). */
const HISTORY = 32;

/**
 * Movement latency: time from a bot emitting `player:move` to another bot receiving the
 * `world:delta` with that position (same process, same clock). Includes the wait for the tick.
 */
export class LatencyTracker {
  readonly #sent = new Map<string, SentStep[]>();
  readonly samples: number[] = [];

  sent(userId: string, x: number, y: number, at: number): void {
    let steps = this.#sent.get(userId);
    if (steps === undefined) {
      steps = [];
      this.#sent.set(userId, steps);
    }
    steps.push({ x, y, at });
    if (steps.length > HISTORY) steps.shift();
  }

  /** A position of `userId` seen by another bot at `now`; returns the latency when matched. */
  received(userId: string, x: number, y: number, now: number): number | null {
    const steps = this.#sent.get(userId);
    if (steps === undefined) return null;
    for (let i = steps.length - 1; i >= 0; i--) {
      const step = steps[i];
      if (step !== undefined && step.x === x && step.y === y && step.at <= now) {
        const latency = now - step.at;
        this.samples.push(latency);
        return latency;
      }
    }
    return null;
  }
}
