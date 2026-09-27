import { describe, expect, it } from 'vitest';

import { testEnv } from '../../test/config.js';
import { ConfigError, loadConfig } from '../config.js';

function configError(env: Record<string, string | undefined>): ConfigError {
  try {
    loadConfig(env);
  } catch (error) {
    if (error instanceof ConfigError) return error;
    throw error;
  }
  throw new Error('expected loadConfig to fail');
}

describe('loadConfig', () => {
  it('builds a typed configuration from the environment', () => {
    const config = loadConfig(testEnv({ PORT: '4000', PUBLIC_URL: 'http://localhost:5173/' }));
    expect(config.port).toBe(4000);
    expect(config.publicUrl).toBe('http://localhost:5173');
    expect(config.authTestLogin).toBe(true);
    expect(config.google).toBeNull();
    expect(config.sentry).toBeNull();
    expect(config.livekit).toEqual({
      url: 'ws://localhost:7880',
      apiKey: 'devkey',
      apiSecret: 'secret',
    });
    expect(config.version).toMatch(/^\d+\.\d+\.\d+/);
    expect(config.realtime).toEqual({ maxPlayersPerSpace: null });
  });

  it('reports the image tag as the version when the build sets PLAZA_VERSION', () => {
    expect(loadConfig(testEnv({ PLAZA_VERSION: 'v0.3.0' })).version).toBe('v0.3.0');
    expect(loadConfig(testEnv({ PLAZA_VERSION: '' })).version).toMatch(/^\d+\.\d+\.\d+/);
  });

  it('reads an optional cap of people per space (tests and load tests)', () => {
    expect(loadConfig(testEnv({ MAX_PLAYERS_PER_SPACE: '2' })).realtime.maxPlayersPerSpace).toBe(2);
    expect(loadConfig(testEnv({ MAX_PLAYERS_PER_SPACE: '' })).realtime.maxPlayersPerSpace).toBe(
      null,
    );
    expect(configError(testEnv({ MAX_PLAYERS_PER_SPACE: '0' })).variables).toEqual([
      'MAX_PLAYERS_PER_SPACE',
    ]);
  });

  it('reads the admin e-mails of the metrics page, normalised (E8-S7)', () => {
    expect(loadConfig(testEnv()).adminEmails).toEqual([]);
    expect(loadConfig(testEnv({ ADMIN_EMAILS: '' })).adminEmails).toEqual([]);
    expect(
      loadConfig(testEnv({ ADMIN_EMAILS: ' Ana@Acme.com, ,luis@acme.com ' })).adminEmails,
    ).toEqual(['ana@acme.com', 'luis@acme.com']);
  });

  it('names every missing variable', () => {
    const error = configError(testEnv({ DATABASE_URL: undefined, LIVEKIT_API_KEY: undefined }));
    expect(error.variables).toEqual(expect.arrayContaining(['DATABASE_URL', 'LIVEKIT_API_KEY']));
    expect(error.message).toContain('DATABASE_URL: is missing');
  });

  it('rejects invalid values with the variable name', () => {
    const error = configError(testEnv({ SESSION_SECRET: 'short', LIVEKIT_URL: 'http://x' }));
    expect(error.variables).toEqual(expect.arrayContaining(['SESSION_SECRET', 'LIVEKIT_URL']));
  });

  it('refuses AUTH_TEST_LOGIN in production', () => {
    const error = configError(
      testEnv({
        NODE_ENV: 'production',
        AUTH_TEST_LOGIN: 'true',
        GOOGLE_CLIENT_ID: 'id',
        GOOGLE_CLIENT_SECRET: 'secret',
      }),
    );
    expect(error.variables).toContain('AUTH_TEST_LOGIN');
  });

  it('requires Google credentials in production and as a pair', () => {
    expect(
      configError(testEnv({ NODE_ENV: 'production', AUTH_TEST_LOGIN: 'false' })).variables,
    ).toContain('GOOGLE_CLIENT_ID');
    expect(configError(testEnv({ GOOGLE_CLIENT_ID: 'id' })).variables).toContain(
      'GOOGLE_CLIENT_SECRET',
    );
    const config = loadConfig(testEnv({ GOOGLE_CLIENT_ID: 'id', GOOGLE_CLIENT_SECRET: 's' }));
    expect(config.google).toEqual({ clientId: 'id', clientSecret: 's' });
  });

  it('trusts no proxy by default and a number of hops with TRUST_PROXY (E8-S2)', () => {
    expect(loadConfig(testEnv()).trustProxy).toBe(false);
    expect(loadConfig(testEnv({ TRUST_PROXY: '0' })).trustProxy).toBe(false);
    expect(loadConfig(testEnv({ TRUST_PROXY: 'false' })).trustProxy).toBe(false);
    expect(loadConfig(testEnv({ TRUST_PROXY: '1' })).trustProxy).toBe(1);
    // `true` would trust any X-Forwarded-For: refused, like anything that is not a hop count.
    for (const value of ['true', '-1', '1.5', 'caddy']) {
      expect(configError(testEnv({ TRUST_PROXY: value })).variables).toEqual(['TRUST_PROXY']);
    }
  });

  it('reads the health token and the realtime connection limit', () => {
    const defaults = loadConfig(testEnv({ REALTIME_CONNECTIONS_PER_MINUTE: undefined }));
    expect(defaults.healthToken).toBeNull();
    expect(defaults.realtimeConnectionsPerMinute).toBe(120);
    expect(loadConfig(testEnv({ HEALTH_TOKEN: 'x'.repeat(32) })).healthToken).toBe('x'.repeat(32));
    expect(configError(testEnv({ HEALTH_TOKEN: 'short' })).variables).toEqual(['HEALTH_TOKEN']);
  });

  it('treats empty optional variables as unset and enables Sentry only with a DSN', () => {
    expect(loadConfig(testEnv({ SENTRY_DSN: '', GOOGLE_CLIENT_ID: '' })).sentry).toBeNull();
    const config = loadConfig(testEnv({ SENTRY_DSN: 'https://key@o1.ingest.sentry.io/1' }));
    expect(config.sentry).toEqual({
      dsn: 'https://key@o1.ingest.sentry.io/1',
      environment: 'test',
    });
  });
});
