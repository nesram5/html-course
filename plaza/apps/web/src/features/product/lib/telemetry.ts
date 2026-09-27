import { TELEMETRY_MAX_SAMPLES, type TelemetrySample } from '@plaza/shared';

import { postTelemetry } from '../api/product-api';

/** Samples wait this long to travel together (a handful per visit). */
export const TELEMETRY_FLUSH_MS = 5000;

export type TelemetrySend = (
  samples: readonly TelemetrySample[],
  keepalive: boolean,
) => Promise<void>;

/**
 * Batches client measurements for `POST /api/telemetry` (E8-S7): at most
 * {@link TELEMETRY_MAX_SAMPLES} per request, sent {@link TELEMETRY_FLUSH_MS} after the first one
 * or at once when the page is hidden. Telemetry never bothers the person: failures are dropped.
 */
export class TelemetryClient {
  #queue: TelemetrySample[] = [];
  #timer: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly send: TelemetrySend = postTelemetry) {}

  get pending(): number {
    return this.#queue.length;
  }

  record(sample: TelemetrySample): void {
    this.#queue.push(sample);
    if (this.#queue.length >= TELEMETRY_MAX_SAMPLES) {
      this.flush();
      return;
    }
    this.#timer ??= setTimeout(() => {
      this.#timer = null;
      this.flush();
    }, TELEMETRY_FLUSH_MS);
  }

  /** Sends what is queued now; `keepalive` lets it survive leaving the page. */
  flush(keepalive = false): void {
    if (this.#timer !== null) clearTimeout(this.#timer);
    this.#timer = null;
    while (this.#queue.length > 0) {
      const batch = this.#queue.splice(0, TELEMETRY_MAX_SAMPLES);
      this.send(batch, keepalive).catch(() => undefined);
    }
  }
}

/** The app-wide telemetry client. */
export const telemetry = new TelemetryClient();

/** A random id for one visit of the office (not linked to the person). */
export function newSessionKey(): string {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}
