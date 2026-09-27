/** Error reporting of the web app. Sentry is only loaded when `VITE_SENTRY_DSN` is set. */
type Reporter = (error: unknown) => void;
type TimingReporter = (name: string, durationMs: number) => void;

let reporter: Reporter | null = null;
let timingReporter: TimingReporter | null = null;

/** Share of the timing transactions sent to Sentry (they are few: one per conversation). */
const DEFAULT_TRACES_SAMPLE_RATE = 0.2;

function tracesSampleRate(): number {
  const value = Number(import.meta.env.VITE_SENTRY_TRACES_SAMPLE_RATE);
  return Number.isFinite(value) && value >= 0 && value <= 1 ? value : DEFAULT_TRACES_SAMPLE_RATE;
}

export async function initSentry(): Promise<void> {
  const dsn = import.meta.env.VITE_SENTRY_DSN;
  if (dsn === undefined || dsn === '') return;
  const Sentry = await import('@sentry/react');
  Sentry.init({
    dsn,
    release: `plaza-web@${import.meta.env.VITE_APP_VERSION ?? 'dev'}`,
    environment: import.meta.env.MODE,
    sendDefaultPii: false,
    // Only the manual timing transactions below: no automatic page-load or navigation tracing.
    tracesSampleRate: tracesSampleRate(),
  });
  reporter = (error) => {
    Sentry.captureException(error);
  };
  timingReporter = (name, durationMs) => {
    const end = Date.now();
    Sentry.startInactiveSpan({
      name,
      op: 'plaza.timing',
      forceTransaction: true,
      startTime: new Date(end - durationMs),
    }).end(new Date(end));
  };
}

export function reportError(error: unknown): void {
  reporter?.(error);
}

/**
 * Records a duration as a Sentry transaction named `name` (e.g. the time from `media:peers` to
 * the first video frame, E5-S5), so its p95 can be watched. No-op without Sentry.
 */
export function reportTiming(name: string, durationMs: number): void {
  timingReporter?.(name, durationMs);
}
