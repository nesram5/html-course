/**
 * `pnpm validate:maps` — validates the maps package (run in CI): manifest schema and files,
 * map geometry through `parseMap` (required layers, rectangular rooms with `areaId`, spawns,
 * desks over blocking tiles), theme image sizes and declared licenses. See `lib/validate.ts`.
 *
 * Usage: `tsx scripts/validate-maps.ts [packageDir]` (defaults to this package).
 */
import { join, resolve } from 'node:path';
import process from 'node:process';

import { validateMapsPackage } from './lib/validate.js';

const root =
  process.argv[2] === undefined ? join(import.meta.dirname, '..') : resolve(process.argv[2]);
const { problems, manifest } = validateMapsPackage(root);

if (problems.length > 0 || manifest === null) {
  process.stderr.write(`validate:maps failed:\n${problems.map((p) => `  - ${p}`).join('\n')}\n`);
  process.exit(1);
}
process.stdout.write(
  `validate:maps OK (${String(manifest.templates.length)} templates, ${String(manifest.avatars.length)} avatars, ${String(manifest.decor.length)} decor items)\n`,
);
