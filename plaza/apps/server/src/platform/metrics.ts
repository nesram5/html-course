/** Figures exposed by `GET /api/health` (architecture §11.3, E8-S1). Fed by the world module. */
export interface RealtimeMetrics {
  connectedBySpace(): Record<string, number>;
  /** Average duration of the recent ticks, `null` when no tick ran yet. */
  avgTickMs(): number | null;
}

const TICK_WINDOW = 100;

export class InMemoryRealtimeMetrics implements RealtimeMetrics {
  readonly #connected = new Map<string, number>();
  readonly #ticks: number[] = [];

  setConnected(spaceId: string, count: number): void {
    if (count <= 0) this.#connected.delete(spaceId);
    else this.#connected.set(spaceId, count);
  }

  recordTick(durationMs: number): void {
    this.#ticks.push(durationMs);
    if (this.#ticks.length > TICK_WINDOW) this.#ticks.shift();
  }

  connectedBySpace(): Record<string, number> {
    return Object.fromEntries(this.#connected);
  }

  avgTickMs(): number | null {
    if (this.#ticks.length === 0) return null;
    const total = this.#ticks.reduce((sum, value) => sum + value, 0);
    return total / this.#ticks.length;
  }
}
