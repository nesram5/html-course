/** Figures exposed by `GET /api/health` (architecture §11.3, E8-S1). Fed by the world module. */
export interface RealtimeMetrics {
  connectedBySpace(): Record<string, number>;
  /** Average duration of the recent ticks, `null` when no tick ran yet. */
  avgTickMs(): number | null;
  /** Average `media:peers` messages sent per working tick (E5-S2), `null` before the first. */
  avgMediaPeersPerTick(): number | null;
}

const TICK_WINDOW = 100;

function average(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export class InMemoryRealtimeMetrics implements RealtimeMetrics {
  readonly #connected = new Map<string, number>();
  readonly #ticks: number[] = [];
  readonly #mediaPeers: number[] = [];

  setConnected(spaceId: string, count: number): void {
    if (count <= 0) this.#connected.delete(spaceId);
    else this.#connected.set(spaceId, count);
  }

  recordTick(durationMs: number): void {
    this.#ticks.push(durationMs);
    if (this.#ticks.length > TICK_WINDOW) this.#ticks.shift();
  }

  /** `media:peers` messages sent by one working tick (E5-S2). */
  recordMediaPeers(sent: number): void {
    this.#mediaPeers.push(sent);
    if (this.#mediaPeers.length > TICK_WINDOW) this.#mediaPeers.shift();
  }

  connectedBySpace(): Record<string, number> {
    return Object.fromEntries(this.#connected);
  }

  avgTickMs(): number | null {
    return average(this.#ticks);
  }

  avgMediaPeersPerTick(): number | null {
    return average(this.#mediaPeers);
  }
}
