// @ts-check
import { builtinModules } from 'node:module';

import js from '@eslint/js';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

/** Imports forbidden in @plaza/shared: it must run unchanged in the browser and in Node. */
const SHARED_FORBIDDEN_IMPORTS = {
  paths: [
    { name: 'react', message: '@plaza/shared must not depend on React.' },
    { name: 'react-dom', message: '@plaza/shared must not depend on React.' },
    { name: 'phaser', message: '@plaza/shared must not depend on Phaser.' },
    { name: 'socket.io', message: '@plaza/shared must not depend on network libraries.' },
    { name: 'socket.io-client', message: '@plaza/shared must not depend on network libraries.' },
    { name: 'livekit-client', message: '@plaza/shared must not depend on network libraries.' },
    { name: 'fastify', message: '@plaza/shared must not depend on the server.' },
    { name: '@prisma/client', message: '@plaza/shared must not depend on the server.' },
    { name: 'livekit-server-sdk', message: '@plaza/shared must not depend on network libraries.' },
    { name: 'google-auth-library', message: '@plaza/shared must not depend on network libraries.' },
    { name: 'ws', message: '@plaza/shared must not depend on network libraries.' },
    { name: 'undici', message: '@plaza/shared must not depend on network libraries.' },
    { name: 'axios', message: '@plaza/shared must not depend on network libraries.' },
    // Node built-ins imported without the `node:` prefix (`fs`, `path`, ...).
    ...builtinModules
      .filter((name) => !name.startsWith('_'))
      .map((name) => ({ name, message: '@plaza/shared must not use Node.js APIs.' })),
  ],
  patterns: [
    { group: ['node:*'], message: '@plaza/shared must not use Node.js APIs.' },
    {
      group: ['@fastify/*', '@livekit/*', '@sentry/*', 'socket.io/*', 'socket.io-client/*'],
      message: '@plaza/shared must not depend on network or server libraries.',
    },
    {
      group: ['react/*', 'react-dom/*', 'phaser/*'],
      message: '@plaza/shared must stay framework-free.',
    },
    { group: ['@plaza/*'], message: '@plaza/shared must not depend on other workspace packages.' },
  ],
};

/** Features import each other only through their public `index.ts` (standards §5). */
const FEATURE_BOUNDARY_PATTERN = {
  group: ['@/features/*/*', '@/features/*/**'],
  message: "Import other features only through their public index: '@/features/<name>'.",
};
const PHASER_ONLY_IN_WORLD = {
  name: 'phaser',
  message: 'Only features/world may import Phaser (standards §5).',
};
const LIVEKIT_ONLY_IN_MEDIA = [
  {
    name: 'livekit-client',
    message: 'Only features/media may import livekit-client (architecture §6).',
  },
  {
    name: '@livekit/components-react',
    message: 'Only features/media may import @livekit/components-react (architecture §6).',
  },
];

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/coverage/**',
      '**/node_modules/**',
      'playwright-report/**',
      'test-results/**',
      '**/*.d.ts.map',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    linterOptions: { reportUnusedDisableDirectives: 'error' },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-non-null-assertion': 'error',
      '@typescript-eslint/consistent-type-imports': ['error', { fixStyle: 'inline-type-imports' }],
      '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true }],
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' },
      ],
      // Standards §2: TS enums are not used; string unions or `as const` instead.
      'no-restricted-syntax': [
        'error',
        { selector: 'TSEnumDeclaration', message: 'Use a union of string literals or `as const`.' },
      ],
      // Standards §2: named exports only.
      'no-restricted-exports': [
        'error',
        {
          restrictDefaultExports: {
            direct: true,
            named: true,
            defaultFrom: true,
            namedFrom: true,
            namespaceFrom: true,
          },
        },
      ],
      'no-console': 'error',
      eqeqeq: ['error', 'always'],
    },
  },

  // Plain JS files (configs, scripts) and configs outside any tsconfig are not type-checked.
  {
    files: ['**/*.js', '**/*.mjs', '**/*.cjs', 'packages/shared/vitest.config.ts'],
    ...tseslint.configs.disableTypeChecked,
    languageOptions: {
      ...tseslint.configs.disableTypeChecked.languageOptions,
      globals: globals.node,
    },
  },

  // Tool configuration files must default-export.
  {
    files: [
      '**/*.config.{js,ts,mjs}',
      '**/vite.config.ts',
      '**/vitest.config.ts',
      '**/prisma.config.ts',
      '**/playwright.config.ts',
      '**/test/global-setup.ts',
    ],
    rules: { 'no-restricted-exports': 'off' },
  },

  // @plaza/shared: framework- and runtime-free (E0-S2).
  {
    files: ['packages/shared/src/**/*.ts'],
    ignores: ['packages/shared/src/**/__tests__/**'],
    rules: { 'no-restricted-imports': ['error', SHARED_FORBIDDEN_IMPORTS] },
  },

  // Web app: React hooks and accessibility.
  {
    files: ['apps/web/src/**/*.{ts,tsx}'],
    ...reactHooks.configs.flat['recommended-latest'],
  },
  {
    files: ['apps/web/src/**/*.tsx'],
    ...jsxA11y.flatConfigs.recommended,
  },
  {
    files: ['apps/web/src/**/*.{ts,tsx}'],
    languageOptions: { globals: globals.browser },
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [PHASER_ONLY_IN_WORLD, ...LIVEKIT_ONLY_IN_MEDIA],
          patterns: [FEATURE_BOUNDARY_PATTERN],
        },
      ],
    },
  },
  // A later `no-restricted-imports` entry replaces the earlier one entirely, so each override
  // repeats the feature boundary pattern.
  {
    files: ['apps/web/src/features/world/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        { paths: LIVEKIT_ONLY_IN_MEDIA, patterns: [FEATURE_BOUNDARY_PATTERN] },
      ],
    },
  },
  {
    files: ['apps/web/src/features/media/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        { paths: [PHASER_ONLY_IN_WORLD], patterns: [FEATURE_BOUNDARY_PATTERN] },
      ],
    },
  },

  // Node code.
  {
    files: ['apps/server/**/*.ts', 'packages/maps/**/*.ts', 'e2e/**/*.ts', 'scripts/**/*.mjs'],
    languageOptions: { globals: globals.node },
  },

  // Tests: non-null assertions and floating expect chains are acceptable.
  {
    files: [
      '**/__tests__/**/*.{ts,tsx}',
      '**/*.test.{ts,tsx}',
      'e2e/**/*.ts',
      '**/src/test/**/*.{ts,tsx}',
    ],
    rules: {
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/unbound-method': 'off',
    },
  },
);
