import { pino } from 'pino';
import { describe, expect, it } from 'vitest';

import {
  FakeIdentityProvider,
  FakeMediaProvider,
  FakeMeetingProvider,
} from '../adapters/fakes/index.js';
import { GoogleMeetProvider } from '../adapters/google-meet.js';
import { GoogleIdentityProvider } from '../adapters/google-oidc.js';
import { LiveKitMediaProvider } from '../adapters/livekit.js';
import { createContainer } from '../container.js';
import { testConfig } from '../test/config.js';

const logger = pino({ level: 'silent' });

describe('createContainer', () => {
  it('uses the Google fakes when no Google credentials are configured', async () => {
    const container = createContainer({ config: testConfig(), logger });
    expect(container.identity).toBeInstanceOf(FakeIdentityProvider);
    expect(container.meetings).toBeInstanceOf(FakeMeetingProvider);
    expect(container.media.url).toBe('ws://localhost:7880');
    expect(container.now()).toBeInstanceOf(Date);
    await container.db.$disconnect();
  });

  it('uses the real LiveKit adapter with the configured credentials, unless overridden', async () => {
    const config = testConfig({ LIVEKIT_URL: 'wss://lk.example.com' });
    const container = createContainer({ config, logger });
    expect(container.media).toBeInstanceOf(LiveKitMediaProvider);
    expect(container.media.url).toBe('wss://lk.example.com');
    await container.db.$disconnect();

    const media = new FakeMediaProvider();
    const overridden = createContainer({ config, logger, overrides: { media } });
    expect(overridden.media).toBe(media);
    await overridden.db.$disconnect();
  });

  it('uses the Google adapters whenever Google credentials are configured', async () => {
    const config = testConfig({ GOOGLE_CLIENT_ID: 'id', GOOGLE_CLIENT_SECRET: 'secret' });
    const container = createContainer({ config, logger });
    expect(container.identity).toBeInstanceOf(GoogleIdentityProvider);
    expect(container.meetings).toBeInstanceOf(GoogleMeetProvider);
    await container.db.$disconnect();
  });

  it('uses only real adapters in production', async () => {
    const config = testConfig({
      NODE_ENV: 'production',
      AUTH_TEST_LOGIN: 'false',
      GOOGLE_CLIENT_ID: 'id',
      GOOGLE_CLIENT_SECRET: 'secret',
    });
    const container = createContainer({ config, logger });
    expect(container.identity).toBeInstanceOf(GoogleIdentityProvider);
    expect(container.meetings).toBeInstanceOf(GoogleMeetProvider);
    expect(container.media).toBeInstanceOf(LiveKitMediaProvider);
    await container.db.$disconnect();
  });
});
