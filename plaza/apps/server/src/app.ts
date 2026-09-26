import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { dirname } from 'node:path';

import cookie from '@fastify/cookie';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import fastifyStatic from '@fastify/static';
import { CLIENT_HEADER } from '@plaza/shared';
import Fastify, { type FastifyInstance } from 'fastify';

import type { Container } from './container.js';
import { modules as defaultModules } from './modules/index.js';
import { ServiceRegistry, type PlazaModule } from './modules/types.js';
import { AppError, registerErrorHandling } from './platform/errors.js';
import { attachSocketServer } from './platform/socket.js';

const STATE_CHANGING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
/** Public folders of @plaza/maps served at /assets/maps/. */
const MAP_ASSET_FOLDERS = ['templates/', 'avatars/', 'decor/'];

export interface BuildAppOptions {
  /** Defaults to every module of `modules/index.ts`. */
  modules?: readonly PlazaModule[];
}

function mapsPackageDir(): string {
  const require = createRequire(import.meta.url);
  return dirname(require.resolve('@plaza/maps/package.json'));
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

  const app = Fastify({
    loggerInstance: container.logger,
    trustProxy: true,
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
  app.addHook('onRequest', (request, _reply, done) => {
    const missingHeader =
      STATE_CHANGING_METHODS.has(request.method) &&
      request.url.startsWith('/api/') &&
      request.headers[CLIENT_HEADER] === undefined;
    done(missingHeader ? new AppError('FORBIDDEN', 'Missing X-Plaza-Client header') : undefined);
  });

  await app.register(fastifyStatic, {
    root: mapsPackageDir(),
    prefix: '/assets/maps/',
    allowedPath: (pathName) =>
      MAP_ASSET_FOLDERS.some((folder) => pathName.startsWith(`/${folder}`)),
    maxAge: config.isProduction ? '1h' : 0,
  });

  const io = attachSocketServer(app, { corsOrigin: config.publicUrl });
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
