/**
 * `pnpm --filter @bululu/maps generate` — regenerates every asset of the package (templates,
 * themes, avatars, decor, tileset and manifest.json) from `scripts/generator/`.
 */
import { join } from 'node:path';
import process from 'node:process';

import { generateAll, writeAll } from './generator/index.js';

const root = join(import.meta.dirname, '..');
const files = generateAll();
writeAll(root, files);
process.stdout.write(`generate: wrote ${String(files.length)} files under packages/maps\n`);
