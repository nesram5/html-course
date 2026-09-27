import { pino } from 'pino';
import { describe, expect, it } from 'vitest';

import { FakeIdentityProvider, FakeMediaProvider } from '../adapters/fakes/index.js';
import { LiveKitMediaProvider } from '../adapters/livekit.js';
import { createContainer } from '../container.js';
import { testConfig } from '../test/config.js';

const logger = pino({ level: 'silent' });

describe('createContainer', () => {
  it('uses fake adapters outside production', async () => {
    const container = createContainer({ config: testConfig(), logger });
    expect(container.identity).toBeInstanceOf(FakeIdentityProvider);
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
