/** Error reporting of the web app. Sentry is only loaded when `VITE_SENTRY_DSN` is set. */
type Reporter = (error: unknown) => void;

let reporter: Reporter | null = null;

export async function initSentry(): Promise<void> {
  const dsn = import.meta.env.VITE_SENTRY_DSN;
  if (dsn === undefined || dsn === '') return;
  const Sentry = await import('@sentry/react');
  Sentry.init({
    dsn,
    release: `plaza-web@${import.meta.env.VITE_APP_VERSION ?? 'dev'}`,
    environment: import.meta.env.MODE,
    sendDefaultPii: false,
  });
  reporter = (error) => {
    Sentry.captureException(error);
  };
}

export function reportError(error: unknown): void {
  reporter?.(error);
}
