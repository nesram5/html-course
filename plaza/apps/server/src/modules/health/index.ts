import { API_PATHS, HealthResponseSchema, type HealthResponse } from '@plaza/shared';

import type { PlazaModule } from '../types.js';

/** `GET /api/health` → `200 { status: "ok", version, realtime }` (E0-S3, E8-S1). */
export const healthModule: PlazaModule = {
  name: 'health',
  register({ app, container }) {
    app.get(API_PATHS.health, (): HealthResponse => {
      return HealthResponseSchema.parse({
        status: 'ok',
        version: container.config.version,
        realtime: {
          connectedBySpace: container.metrics.connectedBySpace(),
          avgTickMs: container.metrics.avgTickMs(),
        },
      });
    });
  },
};
