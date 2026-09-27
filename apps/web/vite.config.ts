import process from 'node:process';

import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defaultClientConditions } from 'vite';
import { defineConfig } from 'vitest/config';

const apiTarget = process.env.BULULU_API_URL ?? 'http://localhost:3000';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Read VITE_* variables from the monorepo .env (only VITE_* reach the browser).
  envDir: '../..',
  resolve: {
    // Workspace packages are consumed from source (see tsconfig.base.json `customConditions`).
    conditions: ['@bululu/source', ...defaultClientConditions],
    alias: { '@': new URL('./src', import.meta.url).pathname },
  },
  server: {
    port: 5173,
    strictPort: true,
    // In local development the web app and the API share the origin through this proxy.
    proxy: {
      '/api': { target: apiTarget, changeOrigin: false },
      '/assets/maps': { target: apiTarget, changeOrigin: false },
      '/realtime': { target: apiTarget, ws: true, changeOrigin: false },
    },
  },
  preview: { port: 4173 },
  build: {
    sourcemap: true,
    chunkSizeWarningLimit: 2000,
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    css: false,
  },
});
