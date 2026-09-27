import { pino } from 'pino';
import { describe, expect, it } from 'vitest';

import { FakeIdentityProvider, FakeMeetingProvider } from '../adapters/fakes/index.js';
import { GoogleMeetProvider } from '../adapters/google-meet.js';
import { GoogleIdentityProvider } from '../adapters/google-oidc.js';
import { createContainer } from '../container.js';
import { testConfig } from '../test/config.js';

const logger = pino({ level: 'silent' });

describe('createContainer', () => {
  it('uses fake adapters outside production', async () => {
    const container = createContainer({ config: testConfig(), logger });
    expect(container.identity).toBeInstanceOf(FakeIdentityProvider);
    expect(container.meetings).toBeInstanceOf(FakeMeetingProvider);
    expect(container.media.url).toBe('ws://localhost:7880');
    expect(container.now()).toBeInstanceOf(Date);
    await container.db.$disconnect();
  });

  it('uses the Google adapters whenever Google credentials are configured', async () => {
    const config = testConfig({ GOOGLE_CLIENT_ID: 'id', GOOGLE_CLIENT_SECRET: 'secret' });
    const container = createContainer({ config, logger });
    expect(container.identity).toBeInstanceOf(GoogleIdentityProvider);
    expect(container.meetings).toBeInstanceOf(GoogleMeetProvider);
    await container.db.$disconnect();
  });

  it('refuses to run fake adapters in production', () => {
    const config = testConfig({
      NODE_ENV: 'production',
      AUTH_TEST_LOGIN: 'false',
      GOOGLE_CLIENT_ID: 'id',
      GOOGLE_CLIENT_SECRET: 'secret',
    });
    expect(() => createContainer({ config, logger })).toThrow(/refusing to use fakes/);
  });
});
