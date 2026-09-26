/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Sentry DSN of the web app; Sentry is disabled when empty. */
  readonly VITE_SENTRY_DSN?: string;
  readonly VITE_APP_VERSION?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
