import { FakeIdentityProvider, FakeMeetingProvider } from './adapters/fakes/index.js';
import { GoogleMeetProvider } from './adapters/google-meet.js';
import { GoogleIdentityProvider } from './adapters/google-oidc.js';
import type { IdentityProvider } from './adapters/identity-provider.js';
import { LiveKitMediaProvider } from './adapters/livekit.js';
import type { MediaProvider } from './adapters/media-provider.js';
import type { MeetingProvider } from './adapters/meeting-provider.js';
import type { AppConfig } from './platform/config.js';
import { createPrismaClient, type Database } from './platform/db.js';
import { noopErrorReporter, type ErrorReporter } from './platform/error-reporter.js';
import type { Logger } from './platform/logger.js';
import { ManifestMapsCatalog, mapsPackageDir, type MapsCatalog } from './platform/maps-catalog.js';
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
  /** Catalog of `@bululu/maps` (templates, rooms, themes, avatars). */
  maps: MapsCatalog;
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
  // LIVEKIT_URL/API_KEY/API_SECRET are always set (config validation), so the real LiveKit
  // adapter is used everywhere (locally against `livekit-server --dev` or LiveKit Cloud);
  // tests replace it with `FakeMediaProvider` through `overrides.media`.
  const media = new LiveKitMediaProvider(config.livekit);
  // Google sign-in and Meet use the real adapters whenever credentials are configured
  // (always in production, where config validation requires them); the fakes serve tests and
  // local development without credentials.
  if (config.google !== null) {
    return {
      identity: new GoogleIdentityProvider(config.google),
      meetings: new GoogleMeetProvider(config.google),
      media,
    };
  }
  return { identity: new FakeIdentityProvider(), meetings: new FakeMeetingProvider(), media };
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
    maps: overrides.maps ?? ManifestMapsCatalog.fromDir(config.mapsDir ?? mapsPackageDir()),
    now: overrides.now ?? (() => new Date()),
  };
}
