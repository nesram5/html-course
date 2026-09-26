import {
  FakeIdentityProvider,
  FakeMediaProvider,
  FakeMeetingProvider,
} from './adapters/fakes/index.js';
import type { IdentityProvider } from './adapters/identity-provider.js';
import type { MediaProvider } from './adapters/media-provider.js';
import type { MeetingProvider } from './adapters/meeting-provider.js';
import type { AppConfig } from './platform/config.js';
import { createPrismaClient, type Database } from './platform/db.js';
import { noopErrorReporter, type ErrorReporter } from './platform/error-reporter.js';
import type { Logger } from './platform/logger.js';
import { InMemoryRealtimeMetrics } from './platform/metrics.js';

/**
 * Infrastructure shared by every module (manual dependency injection, standards §4).
 * Module services are created by each module in its `register()` (see `modules/README.md`).
 */
export interface Container {
  config: AppConfig;
  logger: Logger;
  reporter: ErrorReporter;
  db: Database;
  metrics: InMemoryRealtimeMetrics;
  identity: IdentityProvider;
  meetings: MeetingProvider;
  media: MediaProvider;
  /** Current time; replaced in tests. */
  now: () => Date;
}

export interface ContainerInput {
  config: AppConfig;
  logger: Logger;
  reporter?: ErrorReporter;
  /** Replace any dependency (tests pass fakes and a test database here). */
  overrides?: Partial<Omit<Container, 'config' | 'logger'>>;
}

function selectAdapters(config: AppConfig): Pick<Container, 'identity' | 'meetings' | 'media'> {
  if (config.isProduction) {
    // TODO(E1-S2, E2-S7, E5-S3): wire GoogleIdentityProvider, GoogleMeetProvider and
    // LiveKitMediaProvider here (fakes stay for tests and local development without credentials).
    throw new Error(
      'Real Google/LiveKit adapters are not implemented yet; refusing to use fakes in production',
    );
  }
  return {
    identity: new FakeIdentityProvider(),
    meetings: new FakeMeetingProvider(),
    media: new FakeMediaProvider(config.livekit.url),
  };
}

export function createContainer({
  config,
  logger,
  reporter,
  overrides = {},
}: ContainerInput): Container {
  const needsAdapters =
    overrides.identity === undefined ||
    overrides.meetings === undefined ||
    overrides.media === undefined;
  const adapters = needsAdapters ? selectAdapters(config) : null;
  const identity = overrides.identity ?? adapters?.identity;
  const meetings = overrides.meetings ?? adapters?.meetings;
  const media = overrides.media ?? adapters?.media;
  if (identity === undefined || meetings === undefined || media === undefined) {
    throw new Error('Adapters could not be created');
  }

  return {
    config,
    logger,
    reporter: overrides.reporter ?? reporter ?? noopErrorReporter,
    db: overrides.db ?? createPrismaClient(config.databaseUrl, logger),
    metrics: overrides.metrics ?? new InMemoryRealtimeMetrics(),
    identity,
    meetings,
    media,
    now: overrides.now ?? (() => new Date()),
  };
}
