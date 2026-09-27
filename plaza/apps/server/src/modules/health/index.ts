import { createHash, timingSafeEqual } from 'node:crypto';
import process from 'node:process';

import {
  API_PATHS,
  HEALTH_TOKEN_HEADER,
  HealthResponseSchema,
  type HealthResponse,
} from '@plaza/shared';
import type { FastifyRequest } from 'fastify';

import type { AppConfig } from '../../platform/config.js';
import type { PlazaModule } from '../types.js';

const MB = 1024 * 1024;

function digest(value: string): Buffer {
  return createHash('sha256').update(value).digest();
}

/**
 * Whether the request may see the detailed figures: with `HEALTH_TOKEN` set, only when the
 * `X-Health-Token` header matches it (constant-time); without it, only outside production
 * (local development, tests and the load test).
 */
export function canSeeDetails(
  config: Pick<AppConfig, 'healthToken' | 'isProduction'>,
  request: FastifyRequest,
): boolean {
  if (config.healthToken === null) return !config.isProduction;
  const sent = request.headers[HEALTH_TOKEN_HEADER];
  if (typeof sent !== 'string' || sent === '') return false;
  return timingSafeEqual(digest(sent), digest(config.healthToken));
}

/**
 * `GET /api/health` (E0-S3, E8-S1): always `200 { status: "ok", version }` while the process
 * serves requests (liveness for the external uptime monitor and the container healthcheck).
 * With the health token it adds connected people and people in a hallway conversation per
 * space, the average tick, `media:peers` per tick and the process memory. Space ids and load
 * figures are not public: they would tell outsiders which spaces exist and how busy they are.
 */
export const healthModule: PlazaModule = {
  name: 'health',
  register({ app, container }) {
    const { config, metrics } = container;
    app.get(API_PATHS.health, (request, reply): HealthResponse => {
      void reply.header('cache-control', 'no-store');
      const live = { status: 'ok' as const, version: config.version };
      if (!canSeeDetails(config, request)) return HealthResponseSchema.parse(live);
      const memory = process.memoryUsage();
      return HealthResponseSchema.parse({
        ...live,
        realtime: {
          connectedBySpace: metrics.connectedBySpace(),
          inConversationBySpace: metrics.inConversationBySpace(),
          avgTickMs: metrics.avgTickMs(),
          avgMediaPeersPerTick: metrics.avgMediaPeersPerTick(),
        },
        process: {
          uptimeSeconds: Math.round(process.uptime()),
          rssMb: Math.round((memory.rss / MB) * 10) / 10,
          heapUsedMb: Math.round((memory.heapUsed / MB) * 10) / 10,
        },
      });
    });
  },
};
