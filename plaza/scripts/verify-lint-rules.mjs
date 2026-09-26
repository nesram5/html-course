// Verifies that the architectural lint rules really fire (E0-S2): writes probe files that
// break a rule, lints them and fails if the expected rule is not reported. Run by `pnpm test`.
import { rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import process from 'node:process';

import { ESLint } from 'eslint';

const root = join(import.meta.dirname, '..');

/** [file, content, expected rule] */
const probes = [
  [
    'packages/shared/src/lint-probe-react.ts',
    "import { useState } from 'react';\nexport const probe = useState;\n",
    'no-restricted-imports',
  ],
  [
    'packages/shared/src/lint-probe-phaser.ts',
    "import { Scene } from 'phaser';\nexport const probe = Scene;\n",
    'no-restricted-imports',
  ],
  [
    'packages/shared/src/lint-probe-node.ts',
    "import { readFileSync } from 'node:fs';\nexport const probe = readFileSync;\n",
    'no-restricted-imports',
  ],
  [
    'packages/shared/src/lint-probe-any.ts',
    'export const probe: any = 1;\n',
    '@typescript-eslint/no-explicit-any',
  ],
  [
    'apps/web/src/features/chat/lint-probe-phaser.ts',
    "import { Scene } from 'phaser';\nexport const probe = Scene;\n",
    'no-restricted-imports',
  ],
  [
    'apps/web/src/features/chat/lint-probe-boundary.ts',
    "import { worldRoutes } from '@/features/world/index';\nexport const probe = worldRoutes;\n",
    'no-restricted-imports',
  ],
  [
    'apps/server/src/lint-probe-console.ts',
    "console.log('x');\nexport const probe = 1;\n",
    'no-console',
  ],
];

const failures = [];
try {
  for (const [file, content] of probes) writeFileSync(join(root, file), content);
  const eslint = new ESLint({ cwd: root });
  const results = await eslint.lintFiles(probes.map(([file]) => file));
  for (const [file, , rule] of probes) {
    const result = results.find((r) => r.filePath === join(root, file));
    const fired = result?.messages.some((m) => m.ruleId === rule && m.severity === 2);
    if (!fired) failures.push(`${file}: expected "${rule}" to be reported`);
  }
} finally {
  for (const [file] of probes) rmSync(join(root, file), { force: true });
}

if (failures.length > 0) {
  process.stderr.write(
    `Lint rule verification failed:\n${failures.map((f) => `  - ${f}`).join('\n')}\n`,
  );
  process.exit(1);
}
process.stdout.write(
  `Lint rules verified (${String(probes.length)} probes rejected as expected)\n`,
);
