import { scrubBreadcrumb, scrubEvent } from '@plaza/shared';
import type { BrowserOptions } from '@sentry/react';

/**
 * Error reporting of the web app. Sentry is only loaded when `VITE_SENTRY_DSN` is set.
 *
 * Every report carries the release (`plaza-web@<VITE_APP_VERSION>`), the person (`user.id`
 * only) and the space (`spaceId` tag), set with {@link setErrorContext}. Chat bodies, tokens,
 * invite links, cookies and e-mails never leave the browser: `sendDefaultPii` is off, console
 * breadcrumbs are dropped and `beforeSend` / `beforeBreadcrumb` scrub the rest (E8-S1).
 */
type Reporter = (error: unknown) => void;
type TimingReporter = (name: string, durationMs: number) => void;

/** Who and where, attached to every report. `null` clears it (signed out, left the office). */
export interface ErrorContext {
  userId?: string | null;
  spaceId?: string | null;
}

let reporter: Reporter | null = null;
let timingReporter: TimingReporter | null = null;
let applyContext: ((context: ErrorContext) => void) | null = null;
const currentContext: ErrorContext = {};

/** Share of the timing transactions sent to Sentry (they are few: one per conversation). */
const DEFAULT_TRACES_SAMPLE_RATE = 0.2;

function tracesSampleRate(): number {
  const value = Number(import.meta.env.VITE_SENTRY_TRACES_SAMPLE_RATE);
  return Number.isFinite(value) && value >= 0 && value <= 1 ? value : DEFAULT_TRACES_SAMPLE_RATE;
}

export interface InitSentryOptions {
  /** Replaces Sentry's HTTP transport (tests inspect what would be sent). */
  transport?: BrowserOptions['transport'];
}

export async function initSentry(options: InitSentryOptions = {}): Promise<void> {
  const dsn = import.meta.env.VITE_SENTRY_DSN;
  if (dsn === undefined || dsn === '') return;
  const Sentry = await import('@sentry/react');
  Sentry.init({
    dsn,
    release: `plaza-web@${import.meta.env.VITE_APP_VERSION ?? 'dev'}`,
    environment: import.meta.env.VITE_SENTRY_ENVIRONMENT || import.meta.env.MODE,
    sendDefaultPii: false,
    // Only the manual timing transactions below: no automatic page-load or navigation tracing.
    tracesSampleRate: tracesSampleRate(),
    beforeSend: (event) => scrubEvent(event),
    beforeSendTransaction: (event) => scrubEvent(event),
    beforeBreadcrumb: (breadcrumb) => scrubBreadcrumb(breadcrumb),
    ...(options.transport !== undefined && { transport: options.transport }),
  });
  applyContext = (context) => {
    if (context.userId !== undefined) {
      Sentry.setUser(context.userId === null ? null : { id: context.userId });
    }
    if (context.spaceId !== undefined) Sentry.setTag('spaceId', context.spaceId ?? undefined);
  };
  applyContext(currentContext);
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

/**
 * Sets who is signed in and which office is open for the next reports. Safe to call before
 * Sentry loads (or without it): the last values are applied once it is ready.
 */
export function setErrorContext(context: ErrorContext): void {
  Object.assign(currentContext, context);
  applyContext?.(context);
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
