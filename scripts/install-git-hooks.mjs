// Installs the Husky git hooks. The git repository root is the parent directory of `plaza/`,
// so Husky is pointed at `plaza/.husky` from there. Skipped silently in CI, when HUSKY=0,
// or when there is no git repository (e.g. a tarball or a Docker build context).
import { execFileSync } from 'node:child_process';
import { relative, resolve } from 'node:path';
import process from 'node:process';

if (process.env.CI || process.env.HUSKY === '0') process.exit(0);

let gitRoot;
try {
  gitRoot = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
} catch {
  process.exit(0);
}

const plazaDir = resolve(import.meta.dirname, '..');
const hooksDir = `${relative(gitRoot, plazaDir) || '.'}/.husky`;

try {
  const { default: husky } = await import('husky');
  process.chdir(gitRoot);
  const message = husky(hooksDir);
  if (message) process.stdout.write(`${message}\n`);
} catch (error) {
  process.stdout.write(`Skipping git hooks installation: ${String(error)}\n`);
}
