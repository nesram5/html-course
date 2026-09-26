import { defaultServerConditions } from 'vite';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Resolve workspace packages to their TypeScript sources (see tsconfig.base.json).
  ssr: { resolve: { conditions: ['@plaza/source', ...defaultServerConditions] } },
  test: {
    environment: 'node',
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          include: ['src/**/*.test.ts'],
          exclude: ['src/**/*.int.test.ts'],
        },
      },
      {
        extends: true,
        test: {
          name: 'integration',
          include: ['src/**/*.int.test.ts'],
          globalSetup: ['src/test/global-setup.ts'],
          // One database for the whole run: integration files must not run concurrently.
          fileParallelism: false,
        },
      },
    ],
  },
});
