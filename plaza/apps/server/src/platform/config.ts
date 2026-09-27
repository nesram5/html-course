import { readFileSync } from 'node:fs';

import { z } from 'zod';

/** Treats empty strings (`FOO=` in .env) as "not set". */
function optional<T extends z.ZodType>(schema: T) {
  return z.preprocess((value) => (value === '' ? undefined : value), schema.optional());
}

const booleanFlag = z
  .enum(['true', 'false', '1', '0'])
  .default('false')
  .transform((value) => value === 'true' || value === '1');

const EnvSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    HOST: z.string().min(1).default('0.0.0.0'),
    PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
      .default('info'),

    DATABASE_URL: z.string().regex(/^postgres(ql)?:\/\//, 'must be a postgresql:// URL'),
    /** Signs cookies and derives invite tokens. At least 32 characters. */
    SESSION_SECRET: z.string().min(32, 'must be at least 32 characters'),
    /** Public origin of the web app, used for redirects, invite URLs and CORS. */
    PUBLIC_URL: z.url(),

    GOOGLE_CLIENT_ID: optional(z.string().min(1)),
    GOOGLE_CLIENT_SECRET: optional(z.string().min(1)),

    LIVEKIT_URL: z.string().regex(/^wss?:\/\//, 'must be a ws:// or wss:// URL'),
    LIVEKIT_API_KEY: z.string().min(1),
    LIVEKIT_API_SECRET: z.string().min(1),

    /** Enables POST /api/auth/test-login (CI and local only). */
    AUTH_TEST_LOGIN: booleanFlag,

    /** Folder with the maps catalog (`manifest.json`); defaults to the `@plaza/maps` package. */
    MAPS_DIR: optional(z.string().min(1)),

    /** Max HTTP requests per minute and client IP (@fastify/rate-limit). */
    RATE_LIMIT_PER_MINUTE: z.coerce.number().int().positive().default(300),

    /**
     * People connected at once per space; `MAX_PLAYERS_PER_SPACE` of `@plaza/shared` (RN-06)
     * when unset. Lowered by tests. (Not imported here: the test global setup loads this file
     * without the workspace source condition.)
     */
    MAX_PLAYERS_PER_SPACE: optional(z.coerce.number().int().positive()),

    /**
     * Comma-separated e-mails of the people who may open the product metrics (`/admin/metricas`,
     * E8-S7). Nobody when unset.
     */
    ADMIN_EMAILS: optional(z.string()),

    SENTRY_DSN: optional(z.url()),
    SENTRY_ENVIRONMENT: optional(z.string().min(1)),
  })
  .superRefine((env, ctx) => {
    if (env.AUTH_TEST_LOGIN && env.NODE_ENV === 'production') {
      ctx.addIssue({
        code: 'custom',
        path: ['AUTH_TEST_LOGIN'],
        message: 'must not be enabled when NODE_ENV=production',
      });
    }
    if ((env.GOOGLE_CLIENT_ID === undefined) !== (env.GOOGLE_CLIENT_SECRET === undefined)) {
      ctx.addIssue({
        code: 'custom',
        path: [env.GOOGLE_CLIENT_ID === undefined ? 'GOOGLE_CLIENT_ID' : 'GOOGLE_CLIENT_SECRET'],
        message: 'GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be set together',
      });
    }
    if (env.NODE_ENV === 'production' && env.GOOGLE_CLIENT_ID === undefined) {
      ctx.addIssue({
        code: 'custom',
        path: ['GOOGLE_CLIENT_ID'],
        message: 'is required when NODE_ENV=production',
      });
    }
  });

/** `"Ana@acme.com, luis@acme.com"` → `["ana@acme.com", "luis@acme.com"]`. */
function parseEmailList(value: string | undefined): readonly string[] {
  if (value === undefined) return [];
  return value
    .split(',')
    .map((email) => email.trim().toLowerCase())
    .filter((email) => email !== '');
}

function readPackageVersion(): string {
  // Same relative location from src/platform (tsx) and dist/platform (node).
  const raw: unknown = JSON.parse(
    readFileSync(new URL('../../package.json', import.meta.url), 'utf8'),
  );
  return z.object({ version: z.string() }).parse(raw).version;
}

const ConfigSchema = EnvSchema.transform((env) => ({
  env: env.NODE_ENV,
  isProduction: env.NODE_ENV === 'production',
  host: env.HOST,
  port: env.PORT,
  logLevel: env.LOG_LEVEL,
  version: readPackageVersion(),
  databaseUrl: env.DATABASE_URL,
  sessionSecret: env.SESSION_SECRET,
  publicUrl: env.PUBLIC_URL.replace(/\/+$/, ''),
  google:
    env.GOOGLE_CLIENT_ID !== undefined && env.GOOGLE_CLIENT_SECRET !== undefined
      ? { clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET }
      : null,
  livekit: { url: env.LIVEKIT_URL, apiKey: env.LIVEKIT_API_KEY, apiSecret: env.LIVEKIT_API_SECRET },
  authTestLogin: env.AUTH_TEST_LOGIN,
  mapsDir: env.MAPS_DIR ?? null,
  rateLimitPerMinute: env.RATE_LIMIT_PER_MINUTE,
  realtime: { maxPlayersPerSpace: env.MAX_PLAYERS_PER_SPACE ?? null },
  adminEmails: parseEmailList(env.ADMIN_EMAILS),
  sentry:
    env.SENTRY_DSN !== undefined
      ? { dsn: env.SENTRY_DSN, environment: env.SENTRY_ENVIRONMENT ?? env.NODE_ENV }
      : null,
}));

export type AppConfig = z.output<typeof ConfigSchema>;

/** Raised when the environment is invalid: the process must not start (E0-S3). */
export class ConfigError extends Error {
  constructor(
    /** Names of the offending variables, e.g. `["DATABASE_URL"]`. */
    readonly variables: readonly string[],
    /** One human-readable line per problem, e.g. `DATABASE_URL: Required`. */
    readonly problems: readonly string[],
  ) {
    super(`Invalid configuration: ${problems.join('; ')}`);
    this.name = 'ConfigError';
  }
}

/** Validates `process.env` (or any record) with zod. Throws {@link ConfigError}. */
export function loadConfig(env: Readonly<Record<string, string | undefined>>): AppConfig {
  const result = ConfigSchema.safeParse(env);
  if (result.success) return result.data;

  const problems = result.error.issues.map((issue) => {
    const variable = issue.path.map(String).join('.') || '(env)';
    const message =
      issue.code === 'invalid_type' && env[variable] === undefined ? 'is missing' : issue.message;
    return `${variable}: ${message}`;
  });
  const variables = [
    ...new Set(result.error.issues.map((issue) => issue.path.map(String).join('.'))),
  ];
  throw new ConfigError(variables, problems);
}
