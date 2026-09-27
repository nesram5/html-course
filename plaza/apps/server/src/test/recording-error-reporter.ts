import type { ErrorContext, ErrorReporter } from '../platform/error-reporter.js';

/** Error reporter double: keeps what would have been sent to Sentry. */
export class RecordingErrorReporter implements ErrorReporter {
  readonly captured: { error: unknown; context: ErrorContext | undefined }[] = [];

  captureException(error: unknown, context?: ErrorContext): void {
    this.captured.push({ error, context });
  }

  flush(): Promise<void> {
    return Promise.resolve();
  }
}
