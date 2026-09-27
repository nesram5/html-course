import type { FastifyInstance } from 'fastify';
import { pino } from 'pino';

import {
  FakeIdentityProvider,
  FakeMediaProvider,
  FakeMeetingProvider,
} from '../adapters/fakes/index.js';
import { buildApp } from '../app.js';
import { createContainer, type Container } from '../container.js';
import type { PlazaModule } from '../modules/types.js';
import { testConfig } from './config.js';
import { fixtureMapsCatalog } from './maps-fixture.js';
import { RecordingErrorReporter } from './recording-error-reporter.js';

export interface TestApp {
  app: FastifyInstance;
  container: Container;
  identity: FakeIdentityProvider;
  meetings: FakeMeetingProvider;
  media: FakeMediaProvider;
  reporter: RecordingErrorReporter;
}

export interface TestAppOptions {
  env?: Record<string, string | undefined>;
  /** Defaults to every module of `modules/index.ts`. */
  modules?: readonly PlazaModule[];
  overrides?: Partial<Omit<Container, 'config' | 'logger'>>;
}

/**
 * Builds the real app with fake adapters, the fixture maps catalog, a silent logger and the test
 * database.
 * Call `app.close()` in `afterEach`/`afterAll`.
 */
export async function buildTestApp(options: TestAppOptions = {}): Promise<TestApp> {
  const config = testConfig(options.env);
  const identity = new FakeIdentityProvider();
  const meetings = new FakeMeetingProvider();
  const media = new FakeMediaProvider(config.livekit.url);
  const reporter = new RecordingErrorReporter();
  const container = createContainer({
    config,
    logger: pino({ level: 'silent' }),
    overrides: {
      identity,
      meetings,
      media,
      reporter,
      maps: fixtureMapsCatalog(),
      ...options.overrides,
    },
  });
  const app = await buildApp(container, options.modules ? { modules: options.modules } : {});
  return { app, container, identity, meetings, media, reporter };
}
