import { randomUUID } from 'node:crypto';

import cookie from '@fastify/cookie';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import fastifyStatic from '@fastify/static';
import { API_PATHS, CLIENT_HEADER } from '@plaza/shared';
import Fastify, { type FastifyInstance } from 'fastify';

import type { Container } from './container.js';
import { modules as defaultModules } from './modules/index.js';
import { ServiceRegistry, type PlazaModule } from './modules/types.js';
import { AppError, registerErrorHandling } from './platform/errors.js';
import { MAP_ASSETS_PREFIX, mapsPackageDir } from './platform/maps-catalog.js';
import { attachSocketServer } from './platform/socket.js';

const STATE_CHANGING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
/**
 * Server-to-server endpoints without the CSRF header: they take no session cookie and verify a
 * signature instead (the LiveKit webhook, E6-S3).
 */
const CSRF_EXEMPT_PATHS: ReadonlySet<string> = new Set([API_PATHS.mediaWebhook]);
/** Public folders of @plaza/maps served at /assets/maps/. */
const MAP_ASSET_FOLDERS = ['templates/', 'avatars/', 'decor/'];

export interface BuildAppOptions {
  /** Defaults to every module of `modules/index.ts`. */
  modules?: readonly PlazaModule[];
}

function originOf(url: string): string {
  return new URL(url.replace(/^ws/, 'http')).origin;
}

/**
 * Builds the Fastify app with every platform plugin and module registered, without listening.
 * Tests call it with a test container and use `app.inject()`.
 */
export async function buildApp(
  container: Container,
  options: BuildAppOptions = {},
): Promise<FastifyInstance> {
  const { config, reporter } = container;
  const hops = config.trustProxy;

  const app = Fastify({
    loggerInstance: container.logger,
    // Only the configured proxy hops may set the client IP (rate limits, logs): with `true`,
    // any client could pick its IP with X-Forwarded-For and dodge the limits (E8-S2).
    // The same as proxy-addr's numeric hop count (not in Fastify's types).
    trustProxy: hops === false ? false : (_address: string, hop: number) => hop < hops,
    bodyLimit: 64 * 1024,
    genReqId: () => randomUUID(),
  });

  registerErrorHandling(app, reporter);

  const livekitOrigin = originOf(config.livekit.url);
  await app.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        connectSrc: ["'self'", livekitOrigin, livekitOrigin.replace(/^http/, 'ws')],
        imgSrc: ["'self'", 'data:', 'blob:', 'https://*.googleusercontent.com'],
        mediaSrc: ["'self'", 'blob:'],
        frameAncestors: ["'none'"],
      },
    },
    crossOriginResourcePolicy: { policy: 'same-site' },
  });
  await app.register(cookie, { secret: config.sessionSecret });
  await app.register(rateLimit, {
    max: config.rateLimitPerMinute,
    timeWindow: '1 minute',
    errorResponseBuilder: (_request, context) =>
      new AppError('RATE_LIMITED', `Rate limit exceeded, retry in ${context.after}`),
  });

  // CSRF defence (architecture §11.1): SameSite=Lax cookie + mandatory custom header.
  // Decided on the MATCHED route (Fastify routes before `onRequest`), never on the raw URL: the
  // router percent-decodes the path, so `/%61pi/...` reaches `/api/...` handlers while a raw
  // `startsWith('/api/')` test would let it through without the header.
  app.addHook('onRequest', (request, _reply, done) => {
    const route = request.routeOptions.url;
    const missingHeader =
      STATE_CHANGING_METHODS.has(request.method) &&
      !(route !== undefined && CSRF_EXEMPT_PATHS.has(route)) &&
      request.headers[CLIENT_HEADER] === undefined;
    done(missingHeader ? new AppError('FORBIDDEN', 'Missing X-Plaza-Client header') : undefined);
  });

  await app.register(fastifyStatic, {
    root: config.mapsDir ?? mapsPackageDir(),
    prefix: `${MAP_ASSETS_PREFIX}/`,
    allowedPath: (pathName) =>
      MAP_ASSET_FOLDERS.some((folder) => pathName.startsWith(`/${folder}`)),
    maxAge: config.isProduction ? '1h' : 0,
  });

  const io = attachSocketServer(app, {
    corsOrigin: config.publicUrl,
    connectionLimit: {
      perMinute: config.realtimeConnectionsPerMinute,
      trustProxy: hops,
      now: () => container.now().getTime(),
    },
  });
  const ctx = {
    app,
    io,
    container,
    services: new ServiceRegistry(),
    socketDeps: { logger: container.logger, reporter },
  };
  for (const module of options.modules ?? defaultModules) {
    await module.register(ctx);
  }

  app.addHook('onClose', async () => {
    await container.db.$disconnect();
  });

  return app;
}
