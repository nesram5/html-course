import { defaultServerConditions } from 'vite';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Resolve workspace packages to their TypeScript sources (see tsconfig.base.json).
  ssr: { resolve: { conditions: ['@plaza/source', ...defaultServerConditions] } },
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
});
