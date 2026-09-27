/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Sentry DSN of the web app; Sentry is disabled when empty. */
  readonly VITE_SENTRY_DSN?: string;
  readonly VITE_APP_VERSION?: string;
  /** `staging` or `beta` in deployed images; the Vite mode otherwise. */
  readonly VITE_SENTRY_ENVIRONMENT?: string;
  /** Share (0..1) of the timing transactions sent to Sentry; 0.2 by default. */
  readonly VITE_SENTRY_TRACES_SAMPLE_RATE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
