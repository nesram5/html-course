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

/** One reading of the server during the run (`/api/health` with the health token). */
export interface ServerSample {
  /** Seconds since the bots started walking. */
  atS: number;
  rssMb: number | null;
  heapUsedMb: number | null;
  avgTickMs: number | null;
  connected: number | null;
  /** p95 of the movement latency measured since the previous sample. */
  latencyP95Ms: number | null;
}

/**
 * Memory growth over the run, from the first sample taken after `warmupS` to the last one
 * (MB per minute): a steady climb under a constant load points to a leak.
 */
export function memoryTrend(
  samples: readonly ServerSample[],
  warmupS: number,
): { fromMb: number; toMb: number; mbPerMinute: number } | null {
  const usable = samples.filter((s) => s.atS >= warmupS && s.heapUsedMb !== null);
  const first = usable[0];
  const last = usable.at(-1);
  if (first === undefined || last === undefined || last.atS <= first.atS) return null;
  const fromMb = first.heapUsedMb ?? 0;
  const toMb = last.heapUsedMb ?? 0;
  return { fromMb, toMb, mbPerMinute: ((toMb - fromMb) / (last.atS - first.atS)) * 60 };
}
