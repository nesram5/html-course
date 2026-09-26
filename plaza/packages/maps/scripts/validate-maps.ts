/**
 * `pnpm validate:maps` — validates the maps package (run in CI).
 *
 * Today: manifest schema and presence of every referenced file.
 * TODO(E2-S1): parse each `map.tmj` with `parseMap` (required layers, rectangular rooms with
 * `areaId`, spawns). TODO(E9-S1): theme images sized `width*32 × height*32` (≤ 4096 px) and a
 * declared license. TODO(E9-S2): unique `deskId` over non-walkable tiles.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import process from 'node:process';

import { ThemeFileSchema, parseManifest } from '../src/manifest.js';

const root = join(import.meta.dirname, '..');
const problems: string[] = [];

function requireFile(relativePath: string): boolean {
  if (existsSync(join(root, relativePath))) return true;
  problems.push(`missing file: ${relativePath}`);
  return false;
}

const manifest = parseManifest(JSON.parse(readFileSync(join(root, 'manifest.json'), 'utf8')));

for (const template of manifest.templates) {
  const base = `templates/${template.dir}`;
  requireFile(`${base}/map.tmj`);
  for (const theme of template.themes) {
    const themeDir = `${base}/themes/${theme.id}`;
    if (!requireFile(`${themeDir}/theme.json`)) continue;
    const themeFile = ThemeFileSchema.safeParse(
      JSON.parse(readFileSync(join(root, themeDir, 'theme.json'), 'utf8')),
    );
    if (!themeFile.success) {
      problems.push(`${themeDir}/theme.json: ${themeFile.error.message}`);
      continue;
    }
    requireFile(`${themeDir}/thumbnail.png`);
    if (themeFile.data.baseThemeId === undefined) {
      requireFile(`${themeDir}/below.png`);
      requireFile(`${themeDir}/above.png`);
    }
  }
}
for (const avatar of manifest.avatars) requireFile(`avatars/${avatar.file}`);
for (const item of manifest.decor) requireFile(`decor/${item.file}`);

if (problems.length > 0) {
  process.stderr.write(`validate:maps failed:\n${problems.map((p) => `  - ${p}`).join('\n')}\n`);
  process.exit(1);
}
process.stdout.write(
  `validate:maps OK (${String(manifest.templates.length)} templates, ${String(manifest.avatars.length)} avatars, ${String(manifest.decor.length)} decor items)\n`,
);
